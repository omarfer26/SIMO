-- =====================================================================
-- SIMO - Pruebas de fn_convertir_pedido_en_venta (SCRUM-62, migración 017)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/008_pedido_a_venta.sql
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
SELECT (SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor')   AS u_ven,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv,
       (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'NEQUI') AS nequi,
       (SELECT min(id_cliente) FROM clientes) AS cliente;

SELECT set_config('simo.id_usuario', (SELECT u_ven::TEXT FROM ref), true);

INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90501, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'PAV-1', 'Producto pedido a venta', 100, 300),
       (90502, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'kg'),
        'PAV-2', 'Producto por kilo', 50, 120);
SELECT fn_registrar_ingreso_bodega(90501, 2, u_inv, 100) FROM ref;
SELECT fn_registrar_ingreso_bodega(90501, 2, u_inv, 160) FROM ref;
SELECT fn_registrar_ingreso_bodega(90502, 5, u_inv) FROM ref;

INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
SELECT n, cliente, u_ven, now() + interval '2 days' FROM ref, (VALUES (9000900), (9000901)) v(n);
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES
    (9000900, 90501, 3, 300, 900), (9000900, 90502, 1.5, 120, 180),
    (9000901, 90502, 1, 120, 120);

SELECT pg_temp.debe_fallar('Un pedido que no está ENTREGADO no se convierte', 'SM020',
    format('SELECT fn_convertir_pedido_en_venta(9000900, %s, %s)', u_ven, nequi)) FROM ref;

SELECT fn_cambiar_estado_pedido(9000900, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
CREATE TEMP TABLE stock_antes AS SELECT id_producto, stock_bodega, stock_almacen FROM productos WHERE id_producto IN (90501, 90502);
CREATE TEMP TABLE movs_antes AS SELECT count(*) AS n FROM movimientos_inventario;

-- ------------------------------ Conversión ------------------------------
CREATE TEMP TABLE v AS SELECT * FROM fn_convertir_pedido_en_venta(9000900, (SELECT u_ven FROM ref), (SELECT nequi FROM ref), 80);
SELECT pg_temp.verificar('La venta toma cliente, pedido, vendedor, método de pago y totales',
    (SELECT id_cliente = ref.cliente AND id_pedido = 9000900 AND id_usuario = ref.u_ven AND id_metodo_pago = ref.nequi
            AND subtotal = 1080 AND descuento = 80 AND impuestos = 0 AND total = 1000 AND estado = 'COMPLETADA'
     FROM v, ref));
SELECT pg_temp.verificar('Las líneas de la venta copian las del pedido',
    (SELECT array_agg(id_producto || ':' || cantidad::TEXT || ':' || precio_unitario::INT || ':' || subtotal_linea::INT ORDER BY id_detalle_venta)
     FROM detalles_ventas WHERE id_venta = (SELECT id_venta FROM v))
        = ARRAY['90501:3.000:300:900', '90502:1.500:120:180']);
SELECT pg_temp.verificar('El costo de la línea es el que salió del Kardex al preparar',
    (SELECT bool_and(d.costo_unitario = (SELECT round(sum(m.cantidad * m.costo_unitario) / sum(m.cantidad), 2)
                                         FROM movimientos_inventario m
                                         WHERE m.id_pedido = 9000900 AND m.id_producto = d.id_producto
                                           AND m.tipo_movimiento = 'SALIDA_PEDIDO'))
     FROM detalles_ventas d WHERE d.id_venta = (SELECT id_venta FROM v)));
SELECT pg_temp.verificar('No mueve stock ni crea movimientos (ya se descontó al preparar)',
    (SELECT n FROM movs_antes) = (SELECT count(*) FROM movimientos_inventario)
    AND NOT EXISTS (SELECT 1 FROM productos p JOIN stock_antes s USING (id_producto)
                    WHERE p.stock_bodega <> s.stock_bodega OR p.stock_almacen <> s.stock_almacen)
    AND NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE id_venta = (SELECT id_venta FROM v)));

-- ------------------------------ Validaciones ------------------------------
SELECT pg_temp.debe_fallar('Un pedido se convierte una sola vez', 'SM021',
    format('SELECT fn_convertir_pedido_en_venta(9000900, %s, %s)', u_ven, nequi)) FROM ref;
SELECT fn_cambiar_estado_pedido(9000901, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
SELECT pg_temp.debe_fallar('Descuento mayor que el total', 'SM023',
    format('SELECT fn_convertir_pedido_en_venta(9000901, %s, %s, 121)', u_ven, nequi)) FROM ref;
SELECT pg_temp.debe_fallar('Descuento negativo', 'SM023',
    format('SELECT fn_convertir_pedido_en_venta(9000901, %s, %s, -1)', u_ven, nequi)) FROM ref;
SELECT pg_temp.debe_fallar('Método de pago inexistente', 'SM022',
    format('SELECT fn_convertir_pedido_en_venta(9000901, %s, 999999)', u_ven)) FROM ref;
UPDATE metodos_pago SET estado = FALSE WHERE id_metodo_pago = (SELECT nequi FROM ref);
SELECT pg_temp.debe_fallar('Método de pago inactivo', 'SM022',
    format('SELECT fn_convertir_pedido_en_venta(9000901, %s, %s)', u_ven, nequi)) FROM ref;
UPDATE metodos_pago SET estado = TRUE WHERE id_metodo_pago = (SELECT nequi FROM ref);
SELECT pg_temp.debe_fallar('Usuario inexistente', 'SM005',
    format('SELECT fn_convertir_pedido_en_venta(9000901, 999999, %s)', nequi)) FROM ref;
SELECT pg_temp.debe_fallar('Pedido inexistente', 'SM018',
    format('SELECT fn_convertir_pedido_en_venta(999999, %s, %s)', u_ven, nequi)) FROM ref;
SELECT pg_temp.verificar('Sin descuento, total = subtotal del pedido',
    (SELECT total = 120 AND descuento = 0
     FROM fn_convertir_pedido_en_venta(9000901, (SELECT u_ven FROM ref), (SELECT nequi FROM ref))));

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de pedido a venta pasaron'; END $$;

ROLLBACK;
