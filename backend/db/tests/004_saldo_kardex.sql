-- =====================================================================
-- SIMO - Pruebas de fn_kardex_producto y fn_validar_kardex (SCRUM-132)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/004_saldo_kardex.sql
--
-- Escenario (producto nuevo, cifras verificables a mano):
--   1. Compra 10 a $100        -> Bodega 10, Almacén 0, promedio 100,    valor 1.000
--   2. Compra 10 a $200        -> Bodega 20, Almacén 0, promedio 150,    valor 3.000
--   3. Traslado 4 al Almacén   -> Bodega 16, Almacén 4, promedio 150,    valor 3.000
--   4. Merma 1 del Almacén     -> Bodega 16, Almacén 3, promedio 150,    valor 2.850
--   5. Ajuste +5 a $90         -> Bodega 21, Almacén 3, promedio 137,50  valor 3.300
--      (19 unidades x $150 = 2.850, más 5 x $90 = 450: 3.300 / 24 = 137,50)
-- =====================================================================

BEGIN;

CREATE FUNCTION pg_temp.verificar(prueba TEXT, condicion BOOLEAN) RETURNS VOID AS $$
BEGIN
    IF condicion IS NOT TRUE THEN RAISE EXCEPTION 'FALLA %', prueba; END IF;
    RAISE NOTICE 'OK   %', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE ref AS
SELECT (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv;

INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90001, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'KARDEX-PRUEBA', 'Producto de prueba Kardex', 100, 300);

SELECT fn_registrar_ingreso_bodega(90001, 10, u_inv, 100) FROM ref;
SELECT fn_registrar_ingreso_bodega(90001, 10, u_inv, 200) FROM ref;

-- Traslado y merma registrados como lo hará la API (saldos y stock coherentes)
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
SELECT 90001, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 4, 150, 16, 4, u_inv FROM ref;
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario, motivo)
SELECT 90001, 'AJUSTE_NEGATIVO', 'ALMACEN', 1, 150, 16, 3, u_inv, 'Merma por daño' FROM ref;
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario, motivo)
SELECT 90001, 'AJUSTE_POSITIVO', 'BODEGA', 5, 90, 21, 3, u_inv, 'Sobrante de conteo' FROM ref;
UPDATE productos SET stock_bodega = 21, stock_almacen = 3 WHERE id_producto = 90001;

CREATE TEMP TABLE k AS SELECT row_number() OVER () AS n, * FROM fn_kardex_producto(90001);

SELECT pg_temp.verificar('Devuelve los 5 movimientos en orden cronológico',
    (SELECT count(*) = 5 FROM k) AND (SELECT array_agg(tipo_movimiento ORDER BY n) FROM k)
        = ARRAY['ENTRADA_COMPRA','ENTRADA_COMPRA','TRASLADO_INTERNO','AJUSTE_NEGATIVO','AJUSTE_POSITIVO']::VARCHAR[]);
SELECT pg_temp.verificar('Saldos acumulados por ubicación movimiento a movimiento',
    (SELECT array_agg(saldo_bodega::INT || '/' || saldo_almacen::INT ORDER BY n) FROM k)
        = ARRAY['10/0','20/0','16/4','16/3','21/3']);
SELECT pg_temp.verificar('Entradas y salidas separadas por ubicación (traslado: sale de Bodega y entra al Almacén)',
    (SELECT salida_bodega = 4 AND entrada_almacen = 4 AND entrada_bodega = 0 AND salida_almacen = 0 FROM k WHERE n = 3));
SELECT pg_temp.verificar('Costo promedio ponderado: 100 -> 150 -> 150 -> 150 -> 137,50',
    (SELECT array_agg(costo_promedio ORDER BY n) FROM k) = ARRAY[100, 150, 150, 150, 137.50]::NUMERIC[]);
SELECT pg_temp.verificar('Saldo valorizado: 1.000 -> 3.000 -> 3.000 -> 2.850 -> 3.300',
    (SELECT array_agg(saldo_valorizado ORDER BY n) FROM k) = ARRAY[1000, 3000, 3000, 2850, 3300]::NUMERIC[]);
SELECT pg_temp.verificar('Todos los saldos guardados coinciden con los recalculados',
    (SELECT bool_and(saldo_coincide) FROM k));

SELECT pg_temp.verificar('El filtro de fechas no altera los saldos (saldo inicial correcto)',
    (SELECT count(*) = 0 FROM fn_kardex_producto(90001, now() + interval '1 day'))
    AND (SELECT saldo_bodega = 21 FROM fn_kardex_producto(90001, now() - interval '1 day') ORDER BY id_movimiento DESC LIMIT 1));

SELECT pg_temp.verificar('fn_validar_kardex: producto consistente',
    (SELECT consistente AND movimientos = 5 AND movimientos_inconsistentes = 0
            AND saldo_bodega_kardex = 21 AND saldo_almacen_kardex = 3 AND valor_inventario = 3300
     FROM fn_validar_kardex(90001)));
SELECT pg_temp.verificar('fn_validar_kardex sin parámetro audita todos los productos',
    (SELECT count(*) = (SELECT count(*) FROM productos) FROM fn_validar_kardex()));

-- ------------------------------ Detección de inconsistencias ------------------------------
UPDATE productos SET stock_bodega = 25 WHERE id_producto = 90001;   -- stock alterado fuera del Kardex
SELECT pg_temp.verificar('Detecta stock del producto distinto al saldo del Kardex',
    (SELECT NOT consistente AND movimientos_inconsistentes = 0 FROM fn_validar_kardex(90001)));
UPDATE productos SET stock_bodega = 21 WHERE id_producto = 90001;

INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario, motivo)
SELECT 90001, 'AJUSTE_NEGATIVO', 'BODEGA', 2, 150, 21, 3, u_inv, 'Movimiento con saldo mal registrado' FROM ref;
SELECT pg_temp.verificar('Detecta el movimiento cuyo saldo guardado no coincide',
    (SELECT NOT saldo_coincide FROM fn_kardex_producto(90001) ORDER BY id_movimiento DESC LIMIT 1)
    AND (SELECT movimientos_inconsistentes = 1 AND NOT consistente FROM fn_validar_kardex(90001)));

DO $$
BEGIN
    BEGIN
        PERFORM fn_kardex_producto(999999);
    EXCEPTION WHEN SQLSTATE 'SM001' THEN
        RAISE NOTICE 'OK   Producto inexistente  [SM001]';
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA producto inexistente debía ser rechazado';
END $$;

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas del saldo del Kardex pasaron'; END $$;

ROLLBACK;
