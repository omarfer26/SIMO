-- =====================================================================
-- SIMO - Pruebas de fn_cambiar_estado_pedido (SCRUM-61, migración 016)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/007_estados_pedido.sql
--
-- Escenario: producto con Bodega 7 y Almacén 3 (10 en total).
--   Pedido A pide 5 -> al preparar sale 3 del Almacén y 2 de Bodega.
--   Pedido B pide 6 -> ya no alcanza (quedan 5): no cambia nada.
--   Cancelar A devuelve 3 al Almacén y 2 a Bodega.
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
       (SELECT id_usuario FROM usuarios WHERE usuario = 'gerente')    AS u_ger;

SELECT set_config('simo.id_usuario', (SELECT u_ven::TEXT FROM ref), true);

INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90401, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'EST-PED-1', 'Producto de prueba de estados', 100, 200),
       (90402, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'EST-PED-2', 'Segundo producto', 50, 90);
SELECT fn_registrar_ingreso_bodega(90401, 10, u_inv) FROM ref;
SELECT fn_registrar_ingreso_bodega(90402, 4, u_inv) FROM ref;
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
SELECT 90401, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 3, 100, 7, 3, u_inv FROM ref;
UPDATE productos SET stock_bodega = 7, stock_almacen = 3 WHERE id_producto = 90401;

INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
SELECT n, (SELECT min(id_cliente) FROM clientes), u_ven, now() + interval '2 days'
FROM ref, (VALUES (9000800), (9000801), (9000802)) v(n);
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES
    (9000800, 90401, 5, 200, 1000), (9000800, 90402, 2, 90, 180),
    (9000801, 90401, 6, 200, 1200),
    (9000802, 90402, 1, 90, 90);

-- ------------------------------ Avance sin efecto en el stock ------------------------------
SELECT pg_temp.verificar('REGISTRADO -> CONFIRMADO no mueve stock',
    (SELECT estado = 'CONFIRMADO' FROM fn_cambiar_estado_pedido(9000800, 'CONFIRMADO', (SELECT u_ven FROM ref)))
    AND NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE id_pedido = 9000800));
SELECT pg_temp.debe_fallar('No se salta estados (CONFIRMADO -> LISTO)', '23514',
    format($q$SELECT fn_cambiar_estado_pedido(9000800, 'LISTO', %s)$q$, u_inv)) FROM ref;

-- ------------------------------ EN_PREPARACION: descuento en cascada ------------------------------
SELECT fn_cambiar_estado_pedido(9000800, 'EN_PREPARACION', u_inv) FROM ref;
SELECT pg_temp.verificar('Descuenta primero del Almacén y luego de Bodega',
    (SELECT stock_almacen = 0 AND stock_bodega = 5 FROM productos WHERE id_producto = 90401)
    AND (SELECT stock_bodega = 2 FROM productos WHERE id_producto = 90402));
SELECT pg_temp.verificar('Un SALIDA_PEDIDO por ubicación, enlazado al pedido, con saldos y responsable',
    (SELECT array_agg(ubicacion_origen || ':' || cantidad::INT || ':' || saldo_bodega::INT || '/' || saldo_almacen::INT ORDER BY id_movimiento)
     FROM movimientos_inventario WHERE id_pedido = 9000800 AND id_producto = 90401)
        = ARRAY['ALMACEN:3:7/0', 'BODEGA:2:5/0']
    AND (SELECT bool_and(tipo_movimiento = 'SALIDA_PEDIDO' AND id_usuario = ref.u_inv)
         FROM movimientos_inventario, ref WHERE id_pedido = 9000800));
SELECT pg_temp.verificar('El Kardex de ambos productos sigue consistente',
    (SELECT bool_and(consistente) FROM fn_validar_kardex() WHERE id_producto IN (90401, 90402)));
SELECT pg_temp.debe_fallar('En preparación ya no se cambian las líneas (015)', 'SM017',
    'UPDATE detalles_pedidos SET cantidad = 1, subtotal_linea = 200 WHERE id_pedido = 9000800 AND id_producto = 90401');

-- ------------------------------ Stock insuficiente: todo o nada ------------------------------
SELECT fn_cambiar_estado_pedido(9000801, 'CONFIRMADO', u_ven) FROM ref;
SELECT pg_temp.debe_fallar('No alcanza el stock total (hay 5, pide 6)', 'SM019',
    format($q$SELECT fn_cambiar_estado_pedido(9000801, 'EN_PREPARACION', %s)$q$, u_inv)) FROM ref;
SELECT pg_temp.verificar('El pedido sin stock sigue CONFIRMADO y no movió nada',
    (SELECT estado = 'CONFIRMADO' FROM pedidos WHERE id_pedido = 9000801)
    AND NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE id_pedido = 9000801)
    AND (SELECT stock_total = 5 FROM productos WHERE id_producto = 90401));

-- ------------------------------ Hasta ENTREGADO ------------------------------
SELECT fn_cambiar_estado_pedido(9000802, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
SELECT pg_temp.verificar('LISTO y ENTREGADO no vuelven a descontar',
    (SELECT count(*) = 1 FROM movimientos_inventario WHERE id_pedido = 9000802)
    AND (SELECT stock_bodega = 1 FROM productos WHERE id_producto = 90402));
SELECT pg_temp.debe_fallar('Un pedido entregado no se cancela', '23514',
    format($q$SELECT fn_cambiar_estado_pedido(9000802, 'CANCELADO', %s, 'tarde')$q$, u_ger)) FROM ref;

-- ------------------------------ Cancelación con reverso ------------------------------
SELECT pg_temp.debe_fallar('Cancelar exige motivo', 'SM015',
    format($q$SELECT fn_cambiar_estado_pedido(9000800, 'CANCELADO', %s, '  ')$q$, u_ger)) FROM ref;
SELECT fn_cambiar_estado_pedido(9000800, 'CANCELADO', u_ger, '  Cliente desistió ') FROM ref;
SELECT pg_temp.verificar('Cancelar devuelve cada cantidad a su ubicación de origen',
    (SELECT stock_almacen = 3 AND stock_bodega = 7 FROM productos WHERE id_producto = 90401)
    AND (SELECT stock_bodega = 3 FROM productos WHERE id_producto = 90402)
    AND (SELECT array_agg(ubicacion_destino || ':' || cantidad::INT ORDER BY id_movimiento)
         FROM movimientos_inventario WHERE id_pedido = 9000800 AND tipo_movimiento = 'REVERSO_PEDIDO' AND id_producto = 90401)
        = ARRAY['ALMACEN:3', 'BODEGA:2']);
SELECT pg_temp.verificar('Historial con el motivo y auditoría CANCELACION_PEDIDO',
    (SELECT motivo = 'Cliente desistió' AND id_usuario = ref.u_ger
     FROM historial_estados_pedido, ref WHERE id_pedido = 9000800 AND estado_nuevo = 'CANCELADO')
    AND (SELECT count(*) = 1 FROM log_auditoria WHERE accion = 'CANCELACION_PEDIDO' AND id_entidad = 9000800
                                                    AND justificacion = 'Cliente desistió'));
SELECT fn_cambiar_estado_pedido(9000801, 'CANCELADO', u_ven, 'Sin stock') FROM ref;
SELECT pg_temp.verificar('Cancelar un pedido que no descontó no genera reversos',
    NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE id_pedido = 9000801));
SELECT pg_temp.verificar('El Kardex queda consistente después de los reversos',
    (SELECT bool_and(consistente) FROM fn_validar_kardex() WHERE id_producto IN (90401, 90402)));
SELECT pg_temp.debe_fallar('Un pedido cancelado no se reabre', '23514',
    format($q$SELECT fn_cambiar_estado_pedido(9000800, 'CONFIRMADO', %s)$q$, u_ven)) FROM ref;
SELECT pg_temp.debe_fallar('Pedido inexistente', 'SM018',
    format($q$SELECT fn_cambiar_estado_pedido(999999, 'CONFIRMADO', %s)$q$, u_ven)) FROM ref;

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de estados de pedido pasaron'; END $$;

ROLLBACK;
