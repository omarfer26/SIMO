-- =====================================================================
-- SIMO - Pruebas de las reglas de líneas de pedido (SCRUM-81, migración 015)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/006_pedidos.sql
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

SELECT set_config('simo.id_usuario', (SELECT id_usuario::TEXT FROM usuarios WHERE usuario = 'vendedor'), true);

INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90201, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'PED-UND', 'Producto por unidad', 1000, 2500),
       (90202, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'kg'),
        'PED-KG', 'Producto por kilo', 1000, 4000),
       (90203, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'PED-INACTIVO', 'Producto inactivo', 1000, 2000);
UPDATE productos SET estado = FALSE WHERE id_producto = 90203;

INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
SELECT 9000600, (SELECT min(id_cliente) FROM clientes), id_usuario, now() + interval '2 days'
FROM usuarios WHERE usuario = 'vendedor';

-- ------------------------------ Total ------------------------------
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea)
VALUES (9000600, 90201, 3, 2500, 7500), (9000600, 90202, 1.25, 4000, 5000);
SELECT pg_temp.verificar('El total se calcula con las líneas',
    (SELECT total = 12500 FROM pedidos WHERE id_pedido = 9000600));
UPDATE detalles_pedidos SET cantidad = 2, subtotal_linea = 5000 WHERE id_pedido = 9000600 AND id_producto = 90201;
SELECT pg_temp.verificar('El total se recalcula al cambiar una línea',
    (SELECT total = 10000 FROM pedidos WHERE id_pedido = 9000600));
DELETE FROM detalles_pedidos WHERE id_pedido = 9000600 AND id_producto = 90202;
SELECT pg_temp.verificar('El total se recalcula al quitar una línea',
    (SELECT total = 5000 FROM pedidos WHERE id_pedido = 9000600));
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea)
VALUES (9000600, 90202, 0.5, 4000, 2000);

-- ------------------------------ Validación de líneas ------------------------------
SELECT pg_temp.debe_fallar('Producto inactivo en una línea', 'SM002',
    $q$INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES (9000600, 90203, 1, 2000, 2000)$q$);
SELECT pg_temp.debe_fallar('Decimales en producto por unidad', 'SM004',
    $q$UPDATE detalles_pedidos SET cantidad = 1.5, subtotal_linea = 3750 WHERE id_pedido = 9000600 AND id_producto = 90201$q$);
SELECT pg_temp.debe_fallar('Producto repetido en el pedido', '23505',
    $q$INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES (9000600, 90201, 1, 2500, 2500)$q$);

-- ------------------------------ Líneas fijas desde EN_PREPARACION ------------------------------
UPDATE pedidos SET estado = 'CONFIRMADO' WHERE id_pedido = 9000600;
UPDATE detalles_pedidos SET cantidad = 4, subtotal_linea = 10000 WHERE id_pedido = 9000600 AND id_producto = 90201;
SELECT pg_temp.verificar('En CONFIRMADO todavía se pueden ajustar las líneas',
    (SELECT total = 12000 FROM pedidos WHERE id_pedido = 9000600));
UPDATE pedidos SET estado = 'EN_PREPARACION' WHERE id_pedido = 9000600;
SELECT pg_temp.debe_fallar('En preparación no se agregan líneas', 'SM017',
    $q$INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea)
       SELECT 9000600, id_producto, 1, 1, 1 FROM productos WHERE estado AND id_producto NOT IN (90201, 90202) LIMIT 1$q$);
SELECT pg_temp.debe_fallar('En preparación no se cambian cantidades', 'SM017',
    $q$UPDATE detalles_pedidos SET cantidad = 1, subtotal_linea = 2500 WHERE id_pedido = 9000600 AND id_producto = 90201$q$);
SELECT pg_temp.debe_fallar('En preparación no se quitan líneas', 'SM017',
    $q$DELETE FROM detalles_pedidos WHERE id_pedido = 9000600$q$);
SELECT pg_temp.verificar('Las líneas y el total siguen intactos',
    (SELECT count(*) = 2 FROM detalles_pedidos WHERE id_pedido = 9000600)
    AND (SELECT total = 12000 FROM pedidos WHERE id_pedido = 9000600));
SELECT pg_temp.verificar('El historial registró cada estado con el usuario de la sesión',
    (SELECT array_agg(estado_nuevo ORDER BY id_historial) = ARRAY['REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION']::VARCHAR[]
            AND bool_and(id_usuario = (SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor'))
     FROM historial_estados_pedido WHERE id_pedido = 9000600));

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de pedidos pasaron'; END $$;

ROLLBACK;
