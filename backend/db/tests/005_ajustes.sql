-- =====================================================================
-- SIMO - Pruebas de fn_registrar_ajuste (SCRUM-42)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/005_ajustes.sql
-- =====================================================================

BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(prueba TEXT, codigo TEXT, sentencia TEXT) RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE sentencia;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> codigo THEN
            RAISE EXCEPTION 'FALLA % : se esperaba % y llegó % (%)', prueba, codigo, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE 'OK   %  [%] %', prueba, SQLSTATE, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA % : la sentencia debía ser rechazada', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.verificar(prueba TEXT, condicion BOOLEAN) RETURNS VOID AS $$
BEGIN
    IF condicion IS NOT TRUE THEN RAISE EXCEPTION 'FALLA %', prueba; END IF;
    RAISE NOTICE 'OK   %', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE ref AS
SELECT (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv;

-- Producto propio de la prueba: Bodega 10 (compra) y Almacén 4 (traslado)
INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90101, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'AJUSTE-PRUEBA', 'Producto de prueba de ajustes', 1000, 2000),
       (90102, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'kg'),
        'AJUSTE-KG', 'Producto por kilo', 1000, 2000);
SELECT fn_registrar_ingreso_bodega(90101, 10, u_inv) FROM ref;
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
SELECT 90101, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 4, 1000, 6, 4, u_inv FROM ref;
UPDATE productos SET stock_bodega = 6, stock_almacen = 4 WHERE id_producto = 90101;

-- ------------------------------ Ajustes correctos ------------------------------
CREATE TEMP TABLE m1 AS SELECT * FROM fn_registrar_ajuste(90101, 'AJUSTE_NEGATIVO', 'ALMACEN', 3, '  3 unidades con la caja rota ', (SELECT u_inv FROM ref));
SELECT pg_temp.verificar('Ajuste negativo resta solo de la ubicación indicada',
    (SELECT stock_bodega = 6 AND stock_almacen = 1 FROM productos WHERE id_producto = 90101));
SELECT pg_temp.verificar('El movimiento sale del Almacén con saldos, motivo limpio y responsable',
    (SELECT tipo_movimiento = 'AJUSTE_NEGATIVO' AND ubicacion_origen = 'ALMACEN' AND ubicacion_destino IS NULL
            AND saldo_bodega = 6 AND saldo_almacen = 1 AND motivo = '3 unidades con la caja rota'
            AND id_usuario = (SELECT u_inv FROM ref) AND costo_unitario = 1000 FROM m1));

CREATE TEMP TABLE m2 AS SELECT * FROM fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 5, 'Sobrante de conteo', (SELECT u_inv FROM ref), 900);
SELECT pg_temp.verificar('Ajuste positivo suma a la ubicación y entra como destino con su costo',
    (SELECT stock_bodega = 11 AND stock_almacen = 1 FROM productos WHERE id_producto = 90101)
    AND (SELECT ubicacion_destino = 'BODEGA' AND ubicacion_origen IS NULL AND costo_unitario = 900 FROM m2));

SELECT pg_temp.verificar('Cada ajuste queda en log_auditoria con justificación y stock antes/después',
    (SELECT count(*) = 2 FROM log_auditoria WHERE accion = 'AJUSTE_INVENTARIO' AND entidad = 'productos' AND id_entidad = 90101)
    AND (SELECT justificacion = '3 unidades con la caja rota'
                AND datos_anteriores = '{"stock_bodega": 6.000, "stock_almacen": 4.000}'::jsonb
                AND (datos_nuevos->>'stock_almacen')::NUMERIC = 1
                AND (datos_nuevos->>'id_movimiento')::BIGINT = (SELECT id_movimiento FROM m1)
         FROM log_auditoria WHERE id_entidad = 90101 AND accion = 'AJUSTE_INVENTARIO' ORDER BY id_log LIMIT 1));

SELECT pg_temp.verificar('Ajuste negativo que deja la ubicación en cero',
    (SELECT saldo_almacen = 0 FROM fn_registrar_ajuste(90101, 'AJUSTE_NEGATIVO', 'ALMACEN', 1, 'Última unidad dañada', (SELECT u_inv FROM ref))));
SELECT pg_temp.verificar('Admite decimales en productos por kilo',
    (SELECT saldo_bodega = 2.5 FROM fn_registrar_ajuste(90102, 'AJUSTE_POSITIVO', 'BODEGA', 2.5, 'Inventario inicial', (SELECT u_inv FROM ref))));

SELECT pg_temp.verificar('El Kardex del producto sigue consistente',
    (SELECT consistente FROM fn_validar_kardex(90101)) AND (SELECT consistente FROM fn_validar_kardex(90102)));

-- ------------------------------ Validaciones ------------------------------
SELECT pg_temp.debe_fallar('Stock insuficiente en la ubicación', 'SM014',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_NEGATIVO', 'ALMACEN', 1, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('No toma de otra ubicación aunque el total alcance', 'SM014',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_NEGATIVO', 'BODEGA', 12, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Motivo vacío', 'SM015',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 1, '   ', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Motivo nulo', 'SM015',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 1, NULL, %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Tipo de ajuste inválido', 'SM016',
    format($q$SELECT fn_registrar_ajuste(90101, 'ENTRADA_COMPRA', 'BODEGA', 1, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Ubicación inválida', 'SM016',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'VITRINA', 1, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Cantidad cero', 'SM003',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 0, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Decimales en producto por unidad', 'SM004',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 1.5, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Producto inexistente', 'SM001',
    format($q$SELECT fn_registrar_ajuste(999999, 'AJUSTE_POSITIVO', 'BODEGA', 1, 'x', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Usuario inexistente', 'SM005',
    $q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 1, 'x', 999999)$q$);
SELECT pg_temp.debe_fallar('Costo negativo', 'SM007',
    format($q$SELECT fn_registrar_ajuste(90101, 'AJUSTE_POSITIVO', 'BODEGA', 1, 'x', %s, -1)$q$, u_inv)) FROM ref;
UPDATE productos SET estado = FALSE WHERE id_producto = 90102;
SELECT pg_temp.debe_fallar('Producto inactivo', 'SM002',
    format($q$SELECT fn_registrar_ajuste(90102, 'AJUSTE_POSITIVO', 'BODEGA', 1, 'x', %s)$q$, u_inv)) FROM ref;

SELECT pg_temp.verificar('Los ajustes rechazados no cambiaron stock, Kardex ni auditoría',
    (SELECT stock_bodega = 11 AND stock_almacen = 0 FROM productos WHERE id_producto = 90101)
    AND (SELECT count(*) = 5 FROM movimientos_inventario WHERE id_producto = 90101)
    AND (SELECT count(*) = 3 FROM log_auditoria WHERE id_entidad = 90101 AND accion = 'AJUSTE_INVENTARIO'));

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de ajustes pasaron'; END $$;

ROLLBACK;
