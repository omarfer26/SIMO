-- =====================================================================
-- SIMO - Migración 018: cancelación de pedidos según CU-13 (SCRUM-100)
-- Función: fn_cambiar_estado_pedido (reemplaza la versión de 016)
-- Requisitos: RF-18, RF-20, RF-24 | CU-13 | HU-11
--
-- 016 ya cancelaba y devolvía el stock. Esta versión completa lo que pide
-- el caso de uso CU-13:
--   * EX-1 / RB-1: un pedido ENTREGADO no se cancela, con el mensaje del CU
--     ("Utilice el módulo de anulación si aplica"). Un pedido ya CANCELADO
--     tampoco se vuelve a cancelar. Ambos con SM024.
--   * EX-2: "La causa de cancelación es obligatoria." (SM015).
--   * RB-3: el registro CANCELACION_PEDIDO de log_auditoria guarda el estado
--     anterior y el saldo reversado: por cada cantidad devuelta, el producto,
--     la ubicación, la cantidad y el saldo de Bodega y Almacén resultante.
-- El avance del ciclo y el descuento al preparar no cambian.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_cambiar_estado_pedido(
    p_id_pedido  INTEGER,
    p_estado     VARCHAR,
    p_id_usuario INTEGER,
    p_motivo     TEXT DEFAULT NULL
)
RETURNS pedidos AS $$
DECLARE
    v_pedido    pedidos%ROWTYPE;
    v_anterior  VARCHAR;
    v_linea     RECORD;
    v_producto  productos%ROWTYPE;
    v_salida    RECORD;
    v_de_alm    NUMERIC;
    v_de_bod    NUMERIC;
    v_reversion JSONB := '[]'::JSONB;
BEGIN
    SELECT * INTO v_pedido FROM pedidos WHERE id_pedido = p_id_pedido FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no existe', p_id_pedido USING ERRCODE = 'SM018';
    END IF;
    v_anterior := v_pedido.estado;

    IF p_estado = 'CANCELADO' THEN
        IF v_anterior = 'ENTREGADO' THEN
            RAISE EXCEPTION 'No se puede cancelar un pedido ya entregado. Utilice el módulo de anulación si aplica'
                USING ERRCODE = 'SM024';
        END IF;
        IF v_anterior = 'CANCELADO' THEN
            RAISE EXCEPTION 'El pedido % ya está cancelado', p_id_pedido USING ERRCODE = 'SM024';
        END IF;
        IF btrim(coalesce(p_motivo, '')) = '' THEN
            RAISE EXCEPTION 'La causa de cancelación es obligatoria' USING ERRCODE = 'SM015';
        END IF;
    END IF;

    -- Usuario y motivo para el historial (trigger fn_registrar_historial_pedido)
    PERFORM set_config('simo.id_usuario', p_id_usuario::TEXT, true);
    PERFORM set_config('simo.motivo', coalesce(btrim(p_motivo), ''), true);

    -- El trigger de 004 valida que la transición sea la siguiente del ciclo
    UPDATE pedidos SET estado = p_estado WHERE id_pedido = p_id_pedido RETURNING * INTO v_pedido;

    IF p_estado = 'EN_PREPARACION' THEN
        FOR v_linea IN
            SELECT d.id_producto, d.cantidad FROM detalles_pedidos d
            WHERE d.id_pedido = p_id_pedido ORDER BY d.id_producto
        LOOP
            SELECT * INTO v_producto FROM productos WHERE id_producto = v_linea.id_producto FOR UPDATE;
            IF v_producto.stock_total < v_linea.cantidad THEN
                RAISE EXCEPTION 'Stock insuficiente para %: hay % y el pedido requiere %',
                    v_producto.sku, trim_scale(v_producto.stock_total), trim_scale(v_linea.cantidad)
                    USING ERRCODE = 'SM019';
            END IF;
            v_de_alm := least(v_linea.cantidad, v_producto.stock_almacen);
            v_de_bod := v_linea.cantidad - v_de_alm;

            UPDATE productos
               SET stock_almacen = stock_almacen - v_de_alm, stock_bodega = stock_bodega - v_de_bod
             WHERE id_producto = v_linea.id_producto
            RETURNING * INTO v_producto;

            -- Saldos de cada fila: el de Almacén se registra antes de tocar Bodega
            IF v_de_alm > 0 THEN
                INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                                                    saldo_bodega, saldo_almacen, id_usuario, id_pedido)
                VALUES (v_linea.id_producto, 'SALIDA_PEDIDO', 'ALMACEN', v_de_alm, v_producto.precio_compra,
                        v_producto.stock_bodega + v_de_bod, v_producto.stock_almacen, p_id_usuario, p_id_pedido);
            END IF;
            IF v_de_bod > 0 THEN
                INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                                                    saldo_bodega, saldo_almacen, id_usuario, id_pedido)
                VALUES (v_linea.id_producto, 'SALIDA_PEDIDO', 'BODEGA', v_de_bod, v_producto.precio_compra,
                        v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_pedido);
            END IF;
        END LOOP;

    ELSIF p_estado = 'CANCELADO' THEN
        -- Devuelve lo que el pedido descontó, a la misma ubicación (CU-13 RB-2)
        FOR v_salida IN
            SELECT m.id_producto, p.sku, m.ubicacion_origen AS ubicacion, m.cantidad, m.costo_unitario
            FROM movimientos_inventario m
            JOIN productos p ON p.id_producto = m.id_producto
            WHERE m.id_pedido = p_id_pedido AND m.tipo_movimiento = 'SALIDA_PEDIDO'
            ORDER BY m.id_producto, m.id_movimiento
        LOOP
            UPDATE productos
               SET stock_almacen = stock_almacen + CASE WHEN v_salida.ubicacion = 'ALMACEN' THEN v_salida.cantidad ELSE 0 END,
                   stock_bodega  = stock_bodega  + CASE WHEN v_salida.ubicacion = 'BODEGA'  THEN v_salida.cantidad ELSE 0 END
             WHERE id_producto = v_salida.id_producto
            RETURNING * INTO v_producto;
            INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario,
                                                saldo_bodega, saldo_almacen, id_usuario, id_pedido, motivo)
            VALUES (v_salida.id_producto, 'REVERSO_PEDIDO', v_salida.ubicacion, v_salida.cantidad, v_salida.costo_unitario,
                    v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_pedido, btrim(p_motivo));
            v_reversion := v_reversion || jsonb_build_object(
                'id_producto', v_salida.id_producto, 'sku', v_salida.sku, 'ubicacion', v_salida.ubicacion,
                'cantidad', v_salida.cantidad,
                'saldo_bodega', v_producto.stock_bodega, 'saldo_almacen', v_producto.stock_almacen);
        END LOOP;

        -- CU-13 RB-3: fecha (columna fecha), usuario, causa escrita y saldo reversado
        INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, justificacion, datos_anteriores, datos_nuevos)
        VALUES (p_id_usuario, 'CANCELACION_PEDIDO', 'pedidos', p_id_pedido, btrim(p_motivo),
                jsonb_build_object('estado', v_anterior),
                jsonb_build_object('estado', 'CANCELADO', 'total', v_pedido.total, 'reversion', v_reversion));
    END IF;

    RETURN v_pedido;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_cambiar_estado_pedido(INTEGER, VARCHAR, INTEGER, TEXT) IS
    'Cambia el estado del pedido; descuenta stock al preparar y lo devuelve al cancelar con auditoría del saldo reversado (SCRUM-61, SCRUM-100)';

COMMIT;
