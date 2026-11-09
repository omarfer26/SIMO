-- =====================================================================
-- SIMO - Migración 020: venta POS y anulación (HU-07, CU-10, CU-11)
-- Funciones: fn_registrar_venta, fn_anular_venta
-- Requisitos: RF-13 a RF-16, RN-01, RN-02, RF-24 | SCRUM-53, SCRUM-54, SCRUM-96
--
-- Hasta ahora la venta se armaba en JavaScript (routes/ventasRoutes.js).
-- Pasa a la base, como el resto de operaciones de inventario, para que el
-- stock, la venta, el Kardex y la auditoría cambien en una sola transacción
-- y dos cajas vendiendo a la vez no vendan la misma unidad.
--
-- fn_registrar_venta
--   * El precio de cada línea es el precio de venta vigente del producto:
--     lo que mande el navegador no se usa (RNF-04).
--   * RN-01: valida contra el stock total (Almacén + Bodega).
--   * RN-02: descuenta primero del Almacén y el resto de Bodega, con un
--     movimiento SALIDA_VENTA por ubicación.
--   * Precios con IVA incluido (igual que el POS): impuestos = 0 y
--     total = subtotal - descuento.
--   * Los productos se bloquean en orden de id: dos ventas con los mismos
--     productos no se bloquean entre sí.
--
-- fn_anular_venta (CU-11)
--   * Exige motivo y un autorizador activo con rol GERENTE o ADMIN.
--   * Devuelve cada cantidad a la ubicación de donde salió (REVERSO_VENTA).
--     Si la venta viene de un pedido, devuelve lo que el pedido descontó.
--   * Deja el registro ANULACION_VENTA en log_auditoria con ejecutor,
--     autorizador, motivo y lo devuelto.
--
-- También: ventas.referencia_pago (código del comprobante de Nequi,
-- Daviplata o transferencia, SCRUM-73) y fn_convertir_pedido_en_venta la
-- recibe como quinto parámetro.
--
-- Errores nuevos:
--   SM025 cliente inexistente o inactivo   SM026 venta sin productos
--   SM028 venta inexistente                SM029 venta ya anulada
--   SM030 autorizador inválido (debe ser GERENTE o ADMIN activo)
-- Reutilizados: SM001 SM002 SM003 SM004 SM005 SM015 SM019 SM022 SM023
-- =====================================================================

BEGIN;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(40);
COMMENT ON COLUMN ventas.referencia_pago IS 'Código del comprobante del pago digital (Nequi, Daviplata, transferencia) - SCRUM-73';

-- ---------------------------------------------------------------------
-- fn_registrar_venta
--   p_lineas: [{"id_producto": 1, "cantidad": 2}, ...]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_registrar_venta(
    p_id_usuario      INTEGER,
    p_id_metodo_pago  INTEGER,
    p_lineas          JSONB,
    p_id_cliente      INTEGER DEFAULT NULL,
    p_descuento       NUMERIC DEFAULT 0,
    p_referencia_pago VARCHAR DEFAULT NULL
)
RETURNS ventas AS $$
DECLARE
    v_venta    ventas%ROWTYPE;
    v_linea    RECORD;
    v_producto productos%ROWTYPE;
    v_decimal  BOOLEAN;
    v_de_alm   NUMERIC;
    v_de_bod   NUMERIC;
    v_subtotal NUMERIC := 0;
    v_desc     NUMERIC := coalesce(p_descuento, 0);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM metodos_pago WHERE id_metodo_pago = p_id_metodo_pago AND estado) THEN
        RAISE EXCEPTION 'El método de pago no existe o está inactivo' USING ERRCODE = 'SM022';
    END IF;
    IF p_id_cliente IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM clientes WHERE id_cliente = p_id_cliente AND estado) THEN
        RAISE EXCEPTION 'El cliente % no existe o está inactivo', p_id_cliente USING ERRCODE = 'SM025';
    END IF;
    IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
        RAISE EXCEPTION 'La venta debe incluir al menos un producto' USING ERRCODE = 'SM026';
    END IF;
    IF v_desc < 0 THEN
        RAISE EXCEPTION 'El descuento no puede ser negativo' USING ERRCODE = 'SM023';
    END IF;

    -- Los totales se completan al final (chk_ventas_total exige que cuadren)
    INSERT INTO ventas (id_cliente, id_usuario, id_metodo_pago, referencia_pago)
    VALUES (p_id_cliente, p_id_usuario, p_id_metodo_pago, NULLIF(btrim(p_referencia_pago), ''))
    RETURNING * INTO v_venta;

    -- Un producto repetido en la canasta se suma en una sola línea
    FOR v_linea IN
        SELECT (l ->> 'id_producto')::INTEGER AS id_producto, sum((l ->> 'cantidad')::NUMERIC) AS cantidad
        FROM jsonb_array_elements(p_lineas) l
        GROUP BY 1 ORDER BY 1
    LOOP
        IF v_linea.id_producto IS NULL THEN
            RAISE EXCEPTION 'Cada línea de la venta debe indicar el producto' USING ERRCODE = 'SM001';
        END IF;
        IF v_linea.cantidad IS NULL OR v_linea.cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a cero' USING ERRCODE = 'SM003';
        END IF;

        SELECT * INTO v_producto FROM productos WHERE id_producto = v_linea.id_producto FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no existe', v_linea.id_producto USING ERRCODE = 'SM001';
        END IF;
        IF NOT v_producto.estado THEN
            RAISE EXCEPTION 'El producto % está inactivo', v_producto.sku USING ERRCODE = 'SM002';
        END IF;
        SELECT permite_decimales INTO v_decimal FROM unidades_medida WHERE id_unidad = v_producto.id_unidad;
        IF NOT v_decimal AND v_linea.cantidad <> trunc(v_linea.cantidad) THEN
            RAISE EXCEPTION 'La cantidad de % debe ser un número entero', v_producto.sku USING ERRCODE = 'SM004';
        END IF;
        IF v_producto.stock_total < v_linea.cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente de %: quedan % y se intenta vender %',
                v_producto.nombre, trim_scale(v_producto.stock_total), trim_scale(v_linea.cantidad)
                USING ERRCODE = 'SM019';
        END IF;

        v_de_alm := least(v_linea.cantidad, v_producto.stock_almacen);
        v_de_bod := v_linea.cantidad - v_de_alm;

        INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, costo_unitario, subtotal_linea)
        VALUES (v_venta.id_venta, v_producto.id_producto, v_linea.cantidad, v_producto.precio_venta,
                v_producto.precio_compra, round(v_linea.cantidad * v_producto.precio_venta, 2));
        v_subtotal := v_subtotal + round(v_linea.cantidad * v_producto.precio_venta, 2);

        UPDATE productos
           SET stock_almacen = stock_almacen - v_de_alm, stock_bodega = stock_bodega - v_de_bod
         WHERE id_producto = v_producto.id_producto
        RETURNING * INTO v_producto;

        -- Saldos de cada fila: el de Almacén se registra antes de tocar Bodega
        IF v_de_alm > 0 THEN
            INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                                                saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia)
            VALUES (v_producto.id_producto, 'SALIDA_VENTA', 'ALMACEN', v_de_alm, v_producto.precio_compra,
                    v_producto.stock_bodega + v_de_bod, v_producto.stock_almacen, p_id_usuario, v_venta.id_venta,
                    'VENTA-' || v_venta.id_venta);
        END IF;
        IF v_de_bod > 0 THEN
            INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                                                saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia)
            VALUES (v_producto.id_producto, 'SALIDA_VENTA', 'BODEGA', v_de_bod, v_producto.precio_compra,
                    v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, v_venta.id_venta,
                    'VENTA-' || v_venta.id_venta);
        END IF;
    END LOOP;

    IF v_desc > v_subtotal THEN
        RAISE EXCEPTION 'El descuento (%) no puede ser mayor que el subtotal (%)', v_desc, v_subtotal
            USING ERRCODE = 'SM023';
    END IF;

    UPDATE ventas SET subtotal = v_subtotal, descuento = v_desc, total = v_subtotal - v_desc
     WHERE id_venta = v_venta.id_venta
    RETURNING * INTO v_venta;

    RETURN v_venta;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_registrar_venta(INTEGER, INTEGER, JSONB, INTEGER, NUMERIC, VARCHAR) IS
    'Venta POS: valida stock total, descuenta en cascada Almacén -> Bodega y registra el Kardex (HU-07, RN-01, RN-02)';

-- ---------------------------------------------------------------------
-- fn_anular_venta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_anular_venta(
    p_id_venta       INTEGER,
    p_id_usuario     INTEGER,
    p_id_autorizador INTEGER,
    p_motivo         TEXT
)
RETURNS ventas AS $$
DECLARE
    v_venta     ventas%ROWTYPE;
    v_salida    RECORD;
    v_producto  productos%ROWTYPE;
    v_reversion JSONB := '[]'::JSONB;
BEGIN
    SELECT * INTO v_venta FROM ventas WHERE id_venta = p_id_venta FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La venta % no existe', p_id_venta USING ERRCODE = 'SM028';
    END IF;
    IF v_venta.estado = 'ANULADA' THEN
        RAISE EXCEPTION 'La venta % ya se encuentra anulada', p_id_venta USING ERRCODE = 'SM029';
    END IF;
    IF btrim(coalesce(p_motivo, '')) = '' THEN
        RAISE EXCEPTION 'El motivo de la anulación es obligatorio' USING ERRCODE = 'SM015';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
                   WHERE u.id_usuario = p_id_autorizador AND u.estado AND r.codigo IN ('GERENTE', 'ADMIN')) THEN
        RAISE EXCEPTION 'La anulación debe autorizarla un Gerente o Administrador activo' USING ERRCODE = 'SM030';
    END IF;

    -- Devuelve lo que salió por esta venta; si viene de un pedido, lo que
    -- descontó el pedido al prepararse. Siempre a la ubicación de origen.
    FOR v_salida IN
        SELECT m.id_producto, p.sku, m.ubicacion_origen AS ubicacion, m.cantidad, m.costo_unitario
        FROM movimientos_inventario m
        JOIN productos p ON p.id_producto = m.id_producto
        WHERE (m.id_venta = p_id_venta AND m.tipo_movimiento = 'SALIDA_VENTA')
           OR (v_venta.id_pedido IS NOT NULL AND m.id_pedido = v_venta.id_pedido AND m.tipo_movimiento = 'SALIDA_PEDIDO')
        ORDER BY m.id_producto, m.id_movimiento
    LOOP
        UPDATE productos
           SET stock_almacen = stock_almacen + CASE WHEN v_salida.ubicacion = 'ALMACEN' THEN v_salida.cantidad ELSE 0 END,
               stock_bodega  = stock_bodega  + CASE WHEN v_salida.ubicacion = 'BODEGA'  THEN v_salida.cantidad ELSE 0 END
         WHERE id_producto = v_salida.id_producto
        RETURNING * INTO v_producto;
        INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario,
                                            saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia, motivo)
        VALUES (v_salida.id_producto, 'REVERSO_VENTA', v_salida.ubicacion, v_salida.cantidad, v_salida.costo_unitario,
                v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_venta,
                'ANULACION-VENTA-' || p_id_venta, btrim(p_motivo));
        v_reversion := v_reversion || jsonb_build_object(
            'id_producto', v_salida.id_producto, 'sku', v_salida.sku, 'ubicacion', v_salida.ubicacion,
            'cantidad', v_salida.cantidad,
            'saldo_bodega', v_producto.stock_bodega, 'saldo_almacen', v_producto.stock_almacen);
    END LOOP;

    UPDATE ventas
       SET estado = 'ANULADA', anulada_en = clock_timestamp(), anulada_por = p_id_usuario,
           autorizada_por = p_id_autorizador, motivo_anulacion = btrim(p_motivo)
     WHERE id_venta = p_id_venta
    RETURNING * INTO v_venta;

    INSERT INTO log_auditoria (id_usuario, id_usuario_autorizador, accion, entidad, id_entidad, justificacion,
                               datos_anteriores, datos_nuevos)
    VALUES (p_id_usuario, p_id_autorizador, 'ANULACION_VENTA', 'ventas', p_id_venta, btrim(p_motivo),
            jsonb_build_object('estado', 'COMPLETADA', 'total', v_venta.total),
            jsonb_build_object('estado', 'ANULADA', 'total', v_venta.total, 'reversion', v_reversion));

    RETURN v_venta;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_anular_venta(INTEGER, INTEGER, INTEGER, TEXT) IS
    'Anula una venta con autorización de Gerente/Administrador, devuelve el stock y deja auditoría (CU-11)';

-- ---------------------------------------------------------------------
-- fn_convertir_pedido_en_venta: ahora guarda la referencia del pago digital
-- (misma lógica que en 017; se elimina la firma anterior de 4 parámetros)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_convertir_pedido_en_venta(INTEGER, INTEGER, INTEGER, NUMERIC);

CREATE OR REPLACE FUNCTION fn_convertir_pedido_en_venta(
    p_id_pedido       INTEGER,
    p_id_usuario      INTEGER,
    p_id_metodo_pago  INTEGER,
    p_descuento       NUMERIC DEFAULT 0,
    p_referencia_pago VARCHAR DEFAULT NULL
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

    INSERT INTO ventas (id_cliente, id_usuario, id_pedido, id_metodo_pago, subtotal, descuento, impuestos, total, referencia_pago)
    VALUES (v_pedido.id_cliente, p_id_usuario, p_id_pedido, p_id_metodo_pago,
            v_pedido.total, v_desc, 0, v_pedido.total - v_desc, NULLIF(btrim(p_referencia_pago), ''))
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

COMMENT ON FUNCTION fn_convertir_pedido_en_venta(INTEGER, INTEGER, INTEGER, NUMERIC, VARCHAR) IS
    'Convierte un pedido ENTREGADO en venta con sus líneas, sin mover stock (SCRUM-62, RF-20)';

COMMIT;
