-- =====================================================================
-- SIMO - Migración 014: reserva y devolución de stock de pedidos (HU-10)
-- Funciones: fn_salida_pedido, fn_reverso_pedido
-- Requisitos: RF-17, RF-18, RN-02, RN-04 | HU-010 | CU-12, CU-13
--
-- HU-10 "Reserva en preparación":
--   * Al pasar un pedido a EN_PREPARACION el stock comprometido sale del
--     catálogo en cascada (primero ALMACEN y luego BODEGA, RN-02) y se
--     registra un movimiento SALIDA_PEDIDO por cada ubicación tocada.
--     Los movimientos quedan ligados al pedido (id_pedido), que es la
--     reserva que consulta el Kardex.
--   * Al cancelar el pedido, fn_reverso_pedido devuelve cada cantidad a la
--     MISMA ubicación de origen con un movimiento REVERSO_PEDIDO.
--   * Un pedido solo reserva una vez y solo devuelve una vez: la máquina de
--     estados (fn_validar_transicion_pedido, migración 004) impide volver a
--     EN_PREPARACION o reabrir un CANCELADO, y las funciones lo verifican.
--
-- Códigos de negocio (SQLSTATE clase SM) que la API traduce a HTTP:
--   SM020 pedido inexistente            SM023 el pedido no tiene líneas
--   SM021 el pedido no está en el estado requerido / ya reservó
--   SM022 stock insuficiente            SM024 el stock ya fue devuelto
--   SM001 producto inexistente          SM002 producto inactivo
--   SM005 usuario inexistente o inactivo
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- fn_salida_pedido: reserva el stock de un pedido EN_PREPARACION
-- Devuelve los movimientos SALIDA_PEDIDO generados (uno por ubicación).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_salida_pedido(
    p_id_pedido  INTEGER,
    p_id_usuario INTEGER
)
RETURNS SETOF movimientos_inventario AS $$
DECLARE
    v_pedido   pedidos%ROWTYPE;
    v_linea    RECORD;
    v_producto productos%ROWTYPE;
    v_almacen  NUMERIC;
    v_bodega   NUMERIC;
    v_mov      movimientos_inventario%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;

    -- Bloqueo del pedido: dos cambios de estado simultáneos se serializan aquí.
    SELECT * INTO v_pedido FROM pedidos WHERE id_pedido = p_id_pedido FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no existe', p_id_pedido USING ERRCODE = 'SM020';
    END IF;
    IF v_pedido.estado <> 'EN_PREPARACION' THEN
        RAISE EXCEPTION 'Solo se reserva el stock de un pedido EN_PREPARACION; el pedido % está %',
            p_id_pedido, v_pedido.estado USING ERRCODE = 'SM021';
    END IF;
    IF EXISTS (SELECT 1 FROM movimientos_inventario
               WHERE id_pedido = p_id_pedido AND tipo_movimiento = 'SALIDA_PEDIDO') THEN
        RAISE EXCEPTION 'El stock del pedido % ya fue reservado', p_id_pedido USING ERRCODE = 'SM021';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM detalles_pedidos WHERE id_pedido = p_id_pedido) THEN
        RAISE EXCEPTION 'El pedido % no tiene líneas de producto', p_id_pedido USING ERRCODE = 'SM023';
    END IF;

    FOR v_linea IN
        SELECT id_producto, cantidad
        FROM detalles_pedidos
        WHERE id_pedido = p_id_pedido
        ORDER BY id_detalle_pedido
    LOOP
        -- Bloqueo del producto: la deducción y el saldo se calculan sin carreras (RNF-04).
        SELECT * INTO v_producto FROM productos WHERE id_producto = v_linea.id_producto FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no existe', v_linea.id_producto USING ERRCODE = 'SM001';
        END IF;
        IF NOT v_producto.estado THEN
            RAISE EXCEPTION 'El producto % está inactivo', v_producto.sku USING ERRCODE = 'SM002';
        END IF;
        IF v_producto.stock_total < v_linea.cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para %: se piden % y hay %',
                v_producto.sku, v_linea.cantidad, v_producto.stock_total USING ERRCODE = 'SM022';
        END IF;

        -- Deducción en cascada: primero Almacén y el resto de Bodega (RN-02).
        v_almacen := LEAST(v_linea.cantidad, v_producto.stock_almacen);
        v_bodega  := v_linea.cantidad - v_almacen;

        IF v_almacen > 0 THEN
            UPDATE productos SET stock_almacen = stock_almacen - v_almacen
             WHERE id_producto = v_linea.id_producto
            RETURNING * INTO v_producto;

            INSERT INTO movimientos_inventario (
                id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                saldo_bodega, saldo_almacen, id_usuario, id_pedido, motivo
            ) VALUES (
                v_linea.id_producto, 'SALIDA_PEDIDO', 'ALMACEN', v_almacen, v_producto.precio_compra,
                v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_pedido,
                'Reserva del pedido ' || p_id_pedido || ' en preparación'
            )
            RETURNING * INTO v_mov;
            RETURN NEXT v_mov;
        END IF;

        IF v_bodega > 0 THEN
            UPDATE productos SET stock_bodega = stock_bodega - v_bodega
             WHERE id_producto = v_linea.id_producto
            RETURNING * INTO v_producto;

            INSERT INTO movimientos_inventario (
                id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                saldo_bodega, saldo_almacen, id_usuario, id_pedido, motivo
            ) VALUES (
                v_linea.id_producto, 'SALIDA_PEDIDO', 'BODEGA', v_bodega, v_producto.precio_compra,
                v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_pedido,
                'Reserva del pedido ' || p_id_pedido || ' en preparación'
            )
            RETURNING * INTO v_mov;
            RETURN NEXT v_mov;
        END IF;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_salida_pedido(INTEGER, INTEGER) IS
    'HU-10: reserva el stock de un pedido EN_PREPARACION con deducción en cascada y movimientos SALIDA_PEDIDO';

-- ---------------------------------------------------------------------
-- fn_reverso_pedido: devuelve el stock reservado por un pedido CANCELADO
-- Recorre los SALIDA_PEDIDO del pedido y repone cada cantidad en la misma
-- ubicación de la que salió, con su movimiento REVERSO_PEDIDO.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_reverso_pedido(
    p_id_pedido  INTEGER,
    p_id_usuario INTEGER
)
RETURNS SETOF movimientos_inventario AS $$
DECLARE
    v_pedido   pedidos%ROWTYPE;
    v_salida   movimientos_inventario%ROWTYPE;
    v_producto productos%ROWTYPE;
    v_mov      movimientos_inventario%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;

    SELECT * INTO v_pedido FROM pedidos WHERE id_pedido = p_id_pedido FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no existe', p_id_pedido USING ERRCODE = 'SM020';
    END IF;
    IF v_pedido.estado <> 'CANCELADO' THEN
        RAISE EXCEPTION 'Solo se devuelve el stock de un pedido CANCELADO; el pedido % está %',
            p_id_pedido, v_pedido.estado USING ERRCODE = 'SM021';
    END IF;
    IF EXISTS (SELECT 1 FROM movimientos_inventario
               WHERE id_pedido = p_id_pedido AND tipo_movimiento = 'REVERSO_PEDIDO') THEN
        RAISE EXCEPTION 'El stock del pedido % ya fue devuelto', p_id_pedido USING ERRCODE = 'SM024';
    END IF;

    FOR v_salida IN
        SELECT * FROM movimientos_inventario
        WHERE id_pedido = p_id_pedido AND tipo_movimiento = 'SALIDA_PEDIDO'
        ORDER BY id_movimiento
    LOOP
        IF v_salida.ubicacion_origen = 'ALMACEN' THEN
            UPDATE productos SET stock_almacen = stock_almacen + v_salida.cantidad
             WHERE id_producto = v_salida.id_producto
            RETURNING * INTO v_producto;
        ELSE
            UPDATE productos SET stock_bodega = stock_bodega + v_salida.cantidad
             WHERE id_producto = v_salida.id_producto
            RETURNING * INTO v_producto;
        END IF;

        INSERT INTO movimientos_inventario (
            id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario,
            saldo_bodega, saldo_almacen, id_usuario, id_pedido, motivo
        ) VALUES (
            v_salida.id_producto, 'REVERSO_PEDIDO', v_salida.ubicacion_origen, v_salida.cantidad,
            v_salida.costo_unitario, v_producto.stock_bodega, v_producto.stock_almacen,
            p_id_usuario, p_id_pedido,
            'Devolución del pedido ' || p_id_pedido || ' cancelado'
        )
        RETURNING * INTO v_mov;
        RETURN NEXT v_mov;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_reverso_pedido(INTEGER, INTEGER) IS
    'HU-10: devuelve a su ubicación de origen el stock reservado por un pedido CANCELADO (REVERSO_PEDIDO)';

COMMIT;
