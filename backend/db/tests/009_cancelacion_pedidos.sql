-- =====================================================================
-- SIMO - Pruebas de la cancelación de pedidos según CU-13 (SCRUM-100, 018)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/009_cancelacion_pedidos.sql
-- =====================================================================

BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(prueba TEXT, codigo TEXT, sentencia TEXT, mensaje TEXT DEFAULT NULL) RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE sentencia;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> codigo THEN
            RAISE EXCEPTION 'FALLA % : se esperaba % y llegó % (%)', prueba, codigo, SQLSTATE, SQLERRM;
        END IF;
        IF mensaje IS NOT NULL AND SQLERRM <> mensaje THEN
            RAISE EXCEPTION 'FALLA % : mensaje "%" distinto del esperado "%"', prueba, SQLERRM, mensaje;
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
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv;
SELECT set_config('simo.id_usuario', (SELECT u_ven::TEXT FROM ref), true);

-- Producto con Almacén 3 y Bodega 7
INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90601, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'CAN-1', 'Producto de prueba de cancelación', 100, 250);
SELECT fn_registrar_ingreso_bodega(90601, 10, u_inv) FROM ref;
INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
SELECT 90601, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 3, 100, 7, 3, u_inv FROM ref;
UPDATE productos SET stock_bodega = 7, stock_almacen = 3 WHERE id_producto = 90601;

INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
SELECT n, (SELECT min(id_cliente) FROM clientes), u_ven, now() + interval '2 days'
FROM ref, (VALUES (9001000), (9001001), (9001002), (9001003)) v(n);
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES
    (9001000, 90601, 5, 250, 1250), (9001001, 90601, 1, 250, 250),
    (9001002, 90601, 1, 250, 250), (9001003, 90601, 1, 250, 250);

-- ------------------------------ CA-1 ------------------------------
SELECT fn_cambiar_estado_pedido(9001000, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION']) s;
SELECT pg_temp.verificar('Escenario CA-1: en preparación con 3 del Almacén y 2 de Bodega',
    (SELECT stock_almacen = 0 AND stock_bodega = 5 FROM productos WHERE id_producto = 90601));
SELECT pg_temp.debe_fallar('EX-2: sin causa no se cancela', 'SM015',
    format($q$SELECT fn_cambiar_estado_pedido(9001000, 'CANCELADO', %s, '')$q$, u_ven),
    'La causa de cancelación es obligatoria') FROM ref;
SELECT pg_temp.verificar('EX-2: el pedido y el stock no cambiaron',
    (SELECT estado = 'EN_PREPARACION' FROM pedidos WHERE id_pedido = 9001000)
    AND (SELECT stock_almacen = 0 AND stock_bodega = 5 FROM productos WHERE id_producto = 90601));

SELECT fn_cambiar_estado_pedido(9001000, 'CANCELADO', u_ven, 'El cliente ya no lo necesita') FROM ref;
SELECT pg_temp.verificar('CA-1: CANCELADO y restituye 3 al Almacén y 2 a Bodega',
    (SELECT estado = 'CANCELADO' FROM pedidos WHERE id_pedido = 9001000)
    AND (SELECT stock_almacen = 3 AND stock_bodega = 7 FROM productos WHERE id_producto = 90601));
SELECT pg_temp.verificar('RB-3: auditoría con usuario, causa, estado anterior y saldo reversado',
    (SELECT id_usuario = ref.u_ven AND justificacion = 'El cliente ya no lo necesita' AND fecha IS NOT NULL
            AND datos_anteriores ->> 'estado' = 'EN_PREPARACION'
            AND datos_nuevos ->> 'estado' = 'CANCELADO'
            AND jsonb_array_length(datos_nuevos -> 'reversion') = 2
            AND (datos_nuevos -> 'reversion' -> 0 ->> 'ubicacion') = 'ALMACEN'
            AND (datos_nuevos -> 'reversion' -> 0 ->> 'cantidad')::NUMERIC = 3
            AND (datos_nuevos -> 'reversion' -> 1 ->> 'ubicacion') = 'BODEGA'
            AND (datos_nuevos -> 'reversion' -> 1 ->> 'cantidad')::NUMERIC = 2
            AND (datos_nuevos -> 'reversion' -> 1 ->> 'saldo_bodega')::NUMERIC = 7
            AND (datos_nuevos -> 'reversion' -> 1 ->> 'saldo_almacen')::NUMERIC = 3
     FROM log_auditoria, ref WHERE accion = 'CANCELACION_PEDIDO' AND id_entidad = 9001000));
SELECT pg_temp.verificar('Paso 8: los reversos quedan en el Kardex y el Kardex cuadra',
    (SELECT count(*) = 2 FROM movimientos_inventario WHERE id_pedido = 9001000 AND tipo_movimiento = 'REVERSO_PEDIDO')
    AND (SELECT consistente FROM fn_validar_kardex(90601)));
SELECT pg_temp.debe_fallar('Un pedido cancelado no se cancela de nuevo', 'SM024',
    format($q$SELECT fn_cambiar_estado_pedido(9001000, 'CANCELADO', %s, 'otra vez')$q$, u_ven)) FROM ref;
SELECT pg_temp.verificar('La segunda cancelación no duplicó reversos ni auditoría',
    (SELECT count(*) = 2 FROM movimientos_inventario WHERE id_pedido = 9001000 AND tipo_movimiento = 'REVERSO_PEDIDO')
    AND (SELECT count(*) = 1 FROM log_auditoria WHERE accion = 'CANCELACION_PEDIDO' AND id_entidad = 9001000));

-- ------------------------------ Otros estados ------------------------------
SELECT fn_cambiar_estado_pedido(9001001, 'CANCELADO', u_ven, 'Duplicado') FROM ref;
SELECT pg_temp.verificar('Cancelar en REGISTRADO: sin reversos, auditoría con reversión vacía',
    NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE id_pedido = 9001001)
    AND (SELECT datos_anteriores ->> 'estado' = 'REGISTRADO' AND datos_nuevos -> 'reversion' = '[]'::JSONB
         FROM log_auditoria WHERE accion = 'CANCELACION_PEDIDO' AND id_entidad = 9001001));
SELECT fn_cambiar_estado_pedido(9001002, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO']) s;
SELECT fn_cambiar_estado_pedido(9001002, 'CANCELADO', u_ven, 'El cliente no recibió') FROM ref;
SELECT pg_temp.verificar('Cancelar en LISTO también devuelve el stock',
    (SELECT stock_total = 10 FROM productos WHERE id_producto = 90601));
SELECT fn_cambiar_estado_pedido(9001003, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
SELECT pg_temp.debe_fallar('EX-1 / CA-2: un pedido entregado no se cancela', 'SM024',
    format($q$SELECT fn_cambiar_estado_pedido(9001003, 'CANCELADO', %s, 'tarde')$q$, u_ven),
    'No se puede cancelar un pedido ya entregado. Utilice el módulo de anulación si aplica') FROM ref;

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de cancelación de pedidos pasaron'; END $$;

ROLLBACK;
