-- =====================================================================
-- SIMO - Migración 016: cambio de estado de pedidos con stock (SCRUM-61)
-- Función: fn_cambiar_estado_pedido
-- Requisitos: RF-18, RN-02, RN-04 | CU-12, CU-13 | HU-10, HU-11
--
-- La usa PATCH /api/orders/:id/status (src/controllers/pedidos.controller.js).
--
-- El ciclo REGISTRADO -> CONFIRMADO -> EN_PREPARACION -> LISTO -> ENTREGADO
-- ya lo valida el trigger de 004. Esta función agrega el efecto en el stock,
-- en la misma transacción que el cambio de estado:
--
--   * Al pasar a EN_PREPARACION se descuenta el stock de cada línea, primero
--     del Almacén y luego de Bodega (deducción en cascada, RN-02), con un
--     movimiento SALIDA_PEDIDO por ubicación. Si a una línea no le alcanza
--     el stock total, no se descuenta nada y el pedido no cambia (SM019).
--   * Al CANCELAR un pedido que ya descontó stock (EN_PREPARACION o LISTO),
--     cada SALIDA_PEDIDO se devuelve a su misma ubicación con un
--     REVERSO_PEDIDO. La cancelación exige motivo y queda en log_auditoria.
--   * Las líneas se procesan ordenadas por producto para que dos pedidos
--     simultáneos no se bloqueen mutuamente.
--
-- Errores: SM015 motivo obligatorio al cancelar · SM018 pedido inexistente ·
--          SM019 stock insuficiente · 23514 transición inválida (trigger 004)
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
    v_pedido   pedidos%ROWTYPE;
    v_linea    RECORD;
    v_producto productos%ROWTYPE;
    v_salida   RECORD;
    v_de_alm   NUMERIC;
    v_de_bod   NUMERIC;
BEGIN
    SELECT * INTO v_pedido FROM pedidos WHERE id_pedido = p_id_pedido FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no existe', p_id_pedido USING ERRCODE = 'SM018';
    END IF;
    IF p_estado = 'CANCELADO' AND btrim(coalesce(p_motivo, '')) = '' THEN
        RAISE EXCEPTION 'El motivo de la cancelación es obligatorio' USING ERRCODE = 'SM015';
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
        -- Devuelve lo que el pedido descontó, a la misma ubicación
        FOR v_salida IN
            SELECT m.id_producto, m.ubicacion_origen AS ubicacion, m.cantidad, m.costo_unitario
            FROM movimientos_inventario m
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
        END LOOP;

        INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, justificacion, datos_nuevos)
        VALUES (p_id_usuario, 'CANCELACION_PEDIDO', 'pedidos', p_id_pedido, btrim(p_motivo),
                jsonb_build_object('estado', 'CANCELADO', 'total', v_pedido.total));
    END IF;

    RETURN v_pedido;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_cambiar_estado_pedido(INTEGER, VARCHAR, INTEGER, TEXT) IS
    'Cambia el estado del pedido; descuenta stock en cascada al preparar y lo devuelve al cancelar (SCRUM-61, RN-02, RN-04)';

COMMIT;
