-- =====================================================================
-- SIMO - Migración 017: conversión de pedido entregado en venta (SCRUM-62)
-- Función: fn_convertir_pedido_en_venta
-- Requisitos: RF-20 | CU-12 | HU-12
--
-- Un pedido ENTREGADO se convierte en una venta en un solo paso: la venta
-- toma el cliente y las líneas del pedido, queda enlazada a él
-- (ventas.id_pedido, único) y lleva el método de pago y el descuento.
--
-- NO mueve stock: el inventario ya se descontó al pasar el pedido a
-- EN_PREPARACION (SCRUM-61, SALIDA_PEDIDO). Por eso la venta no genera
-- movimientos SALIDA_VENTA (ver comentario de ventas.id_pedido en 005).
--
-- El costo de cada línea (para márgenes del dashboard) es el costo con el
-- que salió del Kardex al preparar el pedido; si no hay movimientos, el
-- precio de compra actual del producto.
--
-- Precios con IVA incluido, como en el POS: impuestos = 0 y
-- total = subtotal - descuento.
--
-- Errores: SM018 pedido inexistente · SM020 el pedido no está ENTREGADO ·
--          SM021 el pedido ya tiene venta · SM022 método de pago inválido ·
--          SM023 descuento inválido · SM005 usuario inexistente o inactivo
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_convertir_pedido_en_venta(
    p_id_pedido      INTEGER,
    p_id_usuario     INTEGER,
    p_id_metodo_pago INTEGER,
    p_descuento      NUMERIC DEFAULT 0
)
RETURNS ventas AS $$
DECLARE
    v_pedido pedidos%ROWTYPE;
    v_venta  ventas%ROWTYPE;
    v_desc   NUMERIC := coalesce(p_descuento, 0);
BEGIN
    -- El bloqueo del pedido pone en fila dos conversiones simultáneas
    SELECT * INTO v_pedido FROM pedidos WHERE id_pedido = p_id_pedido FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no existe', p_id_pedido USING ERRCODE = 'SM018';
    END IF;
    IF v_pedido.estado <> 'ENTREGADO' THEN
        RAISE EXCEPTION 'Solo un pedido ENTREGADO se convierte en venta; el pedido % está %', p_id_pedido, v_pedido.estado
            USING ERRCODE = 'SM020';
    END IF;
    SELECT * INTO v_venta FROM ventas WHERE id_pedido = p_id_pedido;
    IF FOUND THEN
        RAISE EXCEPTION 'El pedido % ya se convirtió en la venta %', p_id_pedido, v_venta.id_venta
            USING ERRCODE = 'SM021';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM metodos_pago WHERE id_metodo_pago = p_id_metodo_pago AND estado) THEN
        RAISE EXCEPTION 'El método de pago no existe o está inactivo' USING ERRCODE = 'SM022';
    END IF;
    IF v_desc < 0 OR v_desc > v_pedido.total THEN
        RAISE EXCEPTION 'El descuento debe estar entre 0 y el total del pedido (%)', v_pedido.total
            USING ERRCODE = 'SM023';
    END IF;

    INSERT INTO ventas (id_cliente, id_usuario, id_pedido, id_metodo_pago, subtotal, descuento, impuestos, total)
    VALUES (v_pedido.id_cliente, p_id_usuario, p_id_pedido, p_id_metodo_pago,
            v_pedido.total, v_desc, 0, v_pedido.total - v_desc)
    RETURNING * INTO v_venta;

    INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, costo_unitario, subtotal_linea)
    SELECT v_venta.id_venta, d.id_producto, d.cantidad, d.precio_unitario,
           coalesce(
               -- costo ponderado de lo que salió del Kardex para esta línea
               (SELECT round(sum(m.cantidad * m.costo_unitario) / sum(m.cantidad), 2)
                FROM movimientos_inventario m
                WHERE m.id_pedido = p_id_pedido AND m.id_producto = d.id_producto
                  AND m.tipo_movimiento = 'SALIDA_PEDIDO'),
               p.precio_compra),
           d.subtotal_linea
    FROM detalles_pedidos d
    JOIN productos p ON p.id_producto = d.id_producto
    WHERE d.id_pedido = p_id_pedido
    ORDER BY d.id_detalle_pedido;

    RETURN v_venta;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_convertir_pedido_en_venta(INTEGER, INTEGER, INTEGER, NUMERIC) IS
    'Convierte un pedido ENTREGADO en venta con sus líneas, sin mover stock (SCRUM-62, RF-20)';

COMMIT;
