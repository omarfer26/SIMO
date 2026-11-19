-- =====================================================================
-- SIMO - Pruebas de la auditoría completa del Kardex (SCRUM-169, migración 025)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/011_auditoria_kardex.sql
--
-- Primero se crean documentos por los caminos normales (venta, anulación,
-- pedido preparado y cancelado, pedido convertido en venta, compra, ajuste) y
-- se comprueba que la auditoría no los marca. Después se corrompe cada regla
-- a propósito y se comprueba que la auditoría lo detecta.
-- =====================================================================

BEGIN;

CREATE FUNCTION pg_temp.verificar(prueba TEXT, condicion BOOLEAN) RETURNS VOID AS $$
BEGIN
    IF condicion IS NOT TRUE THEN RAISE EXCEPTION 'FALLA %', prueba; END IF;
    RAISE NOTICE 'OK   %', prueba;
END;
$$ LANGUAGE plpgsql;

-- Problemas que la auditoría informa para un documento
CREATE FUNCTION pg_temp.problemas(p_documento TEXT, p_id INTEGER) RETURNS SETOF TEXT AS $$
    SELECT problema FROM fn_auditar_documentos_kardex() WHERE documento = p_documento AND id_documento = p_id;
$$ LANGUAGE sql;

CREATE TEMP TABLE ref AS
SELECT (SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor')   AS u_ven,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'gerente')    AS u_ger,
       (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'EFECTIVO') AS efectivo,
       (SELECT min(id_cliente) FROM clientes) AS cliente,
       (SELECT min(id_proveedor) FROM proveedores) AS proveedor;
SELECT set_config('simo.id_usuario', (SELECT u_ven::TEXT FROM ref), true);

INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90801, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'AUD-1', 'Producto auditoría uno', 100, 300),
       (90802, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'AUD-2', 'Producto auditoría dos', 50, 120);

-- ------------------------------ Documentos por el camino normal ------------------------------
-- Compra confirmada: 20 de cada uno a Bodega; traslado de 5 al Almacén
INSERT INTO compras (id_compra, id_proveedor, id_usuario) SELECT 9002001, proveedor, u_inv FROM ref;
INSERT INTO detalles_compras (id_compra, id_producto, cantidad, costo_unitario) VALUES (9002001, 90801, 20, 100), (9002001, 90802, 20, 50);
DO $$ BEGIN EXECUTE format('CALL sp_confirmar_compra(9002001, %s)', (SELECT u_inv FROM ref)); END $$;
SELECT fn_registrar_traslado(90801, 5, u_inv) FROM ref;
-- Venta POS (cascada: 5 del Almacén y 1 de Bodega) y venta anulada
CREATE TEMP TABLE v1 AS SELECT * FROM fn_registrar_venta((SELECT u_ven FROM ref), (SELECT efectivo FROM ref), '[{"id_producto": 90801, "cantidad": 6}]');
CREATE TEMP TABLE v2 AS SELECT * FROM fn_registrar_venta((SELECT u_ven FROM ref), (SELECT efectivo FROM ref), '[{"id_producto": 90802, "cantidad": 2}]');
SELECT fn_anular_venta((SELECT id_venta FROM v2), u_ven, u_ger, 'Devolución del cliente') FROM ref;
-- Pedido preparado y entregado, convertido en venta; pedido preparado y cancelado; pedido sin preparar
INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
SELECT n, cliente, u_ven, now() + interval '2 days' FROM ref, (VALUES (9002010), (9002011), (9002012)) v(n);
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES
    (9002010, 90801, 3, 300, 900), (9002011, 90802, 4, 120, 480), (9002012, 90802, 1, 120, 120);
SELECT fn_cambiar_estado_pedido(9002010, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
CREATE TEMP TABLE v3 AS SELECT * FROM fn_convertir_pedido_en_venta(9002010, (SELECT u_ven FROM ref), (SELECT efectivo FROM ref));
SELECT fn_cambiar_estado_pedido(9002011, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION']) s;
SELECT fn_cambiar_estado_pedido(9002011, 'CANCELADO', u_ven, 'El cliente desistió') FROM ref;
SELECT fn_cambiar_estado_pedido(9002012, 'CONFIRMADO', u_ven) FROM ref;
-- Ajuste manual con su auditoría
CREATE TEMP TABLE aj AS SELECT * FROM fn_registrar_ajuste(90802, 'AJUSTE_NEGATIVO', 'BODEGA', 1, 'Unidad dañada', (SELECT u_inv FROM ref));

SELECT pg_temp.verificar('Los documentos hechos por el camino normal no tienen observaciones',
    NOT EXISTS (SELECT 1 FROM fn_auditar_documentos_kardex()
                WHERE (documento = 'VENTA'  AND id_documento IN ((SELECT id_venta FROM v1), (SELECT id_venta FROM v2), (SELECT id_venta FROM v3)))
                   OR (documento = 'PEDIDO' AND id_documento IN (9002010, 9002011, 9002012))
                   OR (documento = 'COMPRA' AND id_documento = 9002001)
                   OR (documento = 'AJUSTE' AND id_documento = (SELECT id_movimiento FROM aj))));
SELECT pg_temp.verificar('Los saldos de los dos productos cuadran',
    (SELECT bool_and(consistente) FROM fn_validar_kardex() WHERE id_producto IN (90801, 90802)));

-- ------------------------------ Corrupciones a propósito ------------------------------
-- Las inserciones directas imitan un error de programación que saltara las funciones de la base.

-- 1. Venta POS cuya línea dice 6 y el Kardex tiene una salida de más
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_venta)
SELECT 90801, 'SALIDA_VENTA', 'BODEGA', 1, 100, 13, 0, u_ven, (SELECT id_venta FROM v1) FROM ref;
SELECT pg_temp.verificar('Detecta una venta que descontó más de lo que dicen sus líneas',
    (SELECT array_agg(p) FROM pg_temp.problemas('VENTA', (SELECT id_venta FROM v1)) p)
        = ARRAY['Las salidas del Kardex no coinciden con las líneas de la venta']
    AND (SELECT esperado = 6 AND registrado = 7 FROM fn_auditar_documentos_kardex() WHERE documento = 'VENTA' AND id_documento = (SELECT id_venta FROM v1)));

-- 2. Línea de venta modificada después de registrada (detalles_ventas no está protegida: ver SCRUM-174)
UPDATE detalles_ventas SET cantidad = 1, subtotal_linea = 120 WHERE id_venta = (SELECT id_venta FROM v2);
SELECT pg_temp.verificar('Detecta una línea de venta alterada después de registrada (contra las salidas)',
    EXISTS (SELECT 1 FROM pg_temp.problemas('VENTA', (SELECT id_venta FROM v2)) p
            WHERE p = 'Las salidas del Kardex no coinciden con las líneas de la venta'));

-- 3. Venta de un pedido con salidas propias (descuento doble)
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_venta)
SELECT 90801, 'SALIDA_VENTA', 'BODEGA', 3, 100, 10, 0, u_ven, (SELECT id_venta FROM v3) FROM ref;
SELECT pg_temp.verificar('Detecta una venta de pedido que vuelve a descontar el stock',
    EXISTS (SELECT 1 FROM pg_temp.problemas('VENTA', (SELECT id_venta FROM v3)) p
            WHERE p = 'La venta viene de un pedido y tiene salidas propias (descuento doble)'));

-- 4. Venta COMPLETADA con una devolución
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_venta)
SELECT 90801, 'REVERSO_VENTA', 'ALMACEN', 1, 100, 10, 1, u_ven, (SELECT id_venta FROM v1) FROM ref;
SELECT pg_temp.verificar('Detecta devoluciones en una venta que no está anulada',
    EXISTS (SELECT 1 FROM pg_temp.problemas('VENTA', (SELECT id_venta FROM v1)) p
            WHERE p = 'La venta está COMPLETADA pero tiene devoluciones'));

-- 5. Anulación que devuelve de más a una ubicación
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_venta)
SELECT 90802, 'REVERSO_VENTA', 'BODEGA', 1, 50, 20, 0, u_ven, (SELECT id_venta FROM v2) FROM ref;
SELECT pg_temp.verificar('Detecta una anulación que no devuelve exactamente lo que salió',
    EXISTS (SELECT 1 FROM fn_auditar_documentos_kardex()
            WHERE documento = 'VENTA' AND id_documento = (SELECT id_venta FROM v2) AND ubicacion = 'BODEGA'
              AND problema = 'La anulación no devolvió exactamente lo que salió de esta ubicación' AND esperado = 2 AND registrado = 3));

-- 6. Pedido sin preparar que descontó stock
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_pedido)
SELECT 90802, 'SALIDA_PEDIDO', 'BODEGA', 1, 50, 18, 0, u_inv, 9002012 FROM ref;
SELECT pg_temp.verificar('Detecta un pedido que descontó stock sin pasar por EN_PREPARACION',
    EXISTS (SELECT 1 FROM pg_temp.problemas('PEDIDO', 9002012) p WHERE p = 'El pedido nunca pasó a EN_PREPARACION pero descontó stock'));

-- 7. Cancelación que no devolvió lo que salió
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_pedido)
SELECT 90802, 'SALIDA_PEDIDO', 'BODEGA', 2, 50, 16, 0, u_inv, 9002011 FROM ref;
SELECT pg_temp.verificar('Detecta un pedido cancelado que no devolvió todo (y salidas de más)',
    (SELECT count(*) = 2 FROM pg_temp.problemas('PEDIDO', 9002011) p
     WHERE p IN ('Las salidas del Kardex no coinciden con las líneas del pedido',
                 'La cancelación no devolvió exactamente lo que salió de esta ubicación')));

-- 8. Pedido que avanzó saltándose la preparación (con los triggers desactivados)
INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada) SELECT 9002013, cliente, u_ven, now() + interval '1 day' FROM ref;
-- Solo dentro de esta transacción (se revierte al final)
ALTER TABLE pedidos DISABLE TRIGGER trg_pedidos_validar_transicion;
UPDATE pedidos SET estado = 'ENTREGADO' WHERE id_pedido = 9002013;
ALTER TABLE pedidos ENABLE TRIGGER trg_pedidos_validar_transicion;
SELECT pg_temp.verificar('Detecta un pedido ENTREGADO que nunca pasó por EN_PREPARACION',
    EXISTS (SELECT 1 FROM pg_temp.problemas('PEDIDO', 9002013) p WHERE p LIKE 'El pedido está ENTREGADO sin haber pasado por EN_PREPARACION%'));

-- 9. Compra en BORRADOR con mercancía ingresada
INSERT INTO compras (id_compra, id_usuario) SELECT 9002002, u_inv FROM ref;
INSERT INTO detalles_compras (id_compra, id_producto, cantidad, costo_unitario) VALUES (9002002, 90801, 4, 100);
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_compra)
SELECT 90801, 'ENTRADA_COMPRA', 'BODEGA', 4, 100, 14, 0, u_inv, 9002002 FROM ref;
SELECT pg_temp.verificar('Detecta una compra en BORRADOR que ya ingresó mercancía',
    EXISTS (SELECT 1 FROM pg_temp.problemas('COMPRA', 9002002) p WHERE p = 'La compra está en BORRADOR pero ya ingresó mercancía'));

-- 10. Ajuste manual sin registro en la auditoría
CREATE TEMP TABLE aj2 AS
WITH m AS (
    INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario, saldo_bodega, saldo_almacen, id_usuario, motivo)
    SELECT 90801, 'AJUSTE_POSITIVO', 'BODEGA', 1, 100, 15, 0, u_inv, 'Ajuste por fuera de la función' FROM ref RETURNING id_movimiento
) SELECT id_movimiento FROM m;
SELECT pg_temp.verificar('Detecta un ajuste manual sin su registro en la auditoría',
    EXISTS (SELECT 1 FROM pg_temp.problemas('AJUSTE', (SELECT id_movimiento::INTEGER FROM aj2)) p
            WHERE p = 'El ajuste manual no tiene su registro AJUSTE_INVENTARIO en el log de auditoría'));
SELECT pg_temp.verificar('El ajuste hecho por fn_registrar_ajuste sigue sin observaciones',
    NOT EXISTS (SELECT 1 FROM pg_temp.problemas('AJUSTE', (SELECT id_movimiento::INTEGER FROM aj))));

-- ------------------------------ sp_auditar_kardex ------------------------------
CREATE TEMP TABLE resultado (productos INT, movimientos BIGINT, productos_mal INT, documentos_mal INT);
DO $$
DECLARE a INT; b BIGINT; c INT; d INT;
BEGIN
    CALL sp_auditar_kardex(a, b, c, d);
    INSERT INTO resultado VALUES (a, b, c, d);
END $$;
-- 8 documentos corrompidos: 3 ventas, 3 pedidos, 1 compra y 1 ajuste
SELECT pg_temp.verificar('sp_auditar_kardex cuenta productos, movimientos, saldos descuadrados y documentos',
    (SELECT productos >= 2 AND movimientos > 0 AND productos_mal >= 2 AND documentos_mal >= 8 FROM resultado));
DO $$
DECLARE a INT; b BIGINT; c INT; d INT;
BEGIN
    BEGIN
        CALL sp_auditar_kardex(a, b, c, d, p_estricto => true);
    EXCEPTION WHEN SQLSTATE 'SM033' THEN
        RAISE NOTICE 'OK   sp_auditar_kardex estricto falla con SM033 si hay inconsistencias  [%]', SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA sp_auditar_kardex estricto debía fallar';
END $$;

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de la auditoría del Kardex pasaron'; END $$;

ROLLBACK;
