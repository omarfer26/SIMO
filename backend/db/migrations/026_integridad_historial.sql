-- =====================================================================
-- SIMO - Migración 026: integridad del historial (SCRUM-174)
-- Requisitos: RNF-04, RF-24 | CU-10, CU-11
--
-- Auditoría de las 34 llaves foráneas: toda tabla que guarda historial de una
-- venta, un cliente o un producto los referencia con ON DELETE RESTRICT, así
-- que ninguno se puede borrar mientras tenga historial (ver
-- db/tests/012_integridad.sql, que lo verifica sobre el catálogo). Las dos
-- CASCADE (líneas de compra y de pedido) solo actúan sobre documentos que no
-- se pueden borrar: una compra confirmada tiene movimientos (RESTRICT) y todo
-- pedido tiene historial de estados (RESTRICT).
--
-- La revisión encontró tres huecos, que esta migración cierra:
--
-- 1. Las líneas de venta no estaban protegidas. Se podían cambiar después de
--    registrada la venta, y una venta que viene de un pedido (sin movimientos
--    propios en el Kardex) se podía borrar físicamente quitando primero sus
--    líneas. Ahora detalles_ventas es inalterable, como el Kardex.
-- 2. Una venta registrada se podía modificar: cambiar su total o
--    "desanularla" (volver de ANULADA a COMPLETADA pasa todos los CHECK y deja
--    el stock devuelto dos veces). Ahora la única modificación permitida es la
--    anulación (COMPLETADA -> ANULADA con sus datos), una sola vez. Borrarla o
--    vaciar la tabla no se permite nunca (SM034). Para eso fn_registrar_venta
--    (020) se reescribe en dos fases: valida y calcula los totales y solo
--    entonces inserta la venta completa; antes la insertaba vacía y la
--    actualizaba al final.
-- 3. Los pagos digitales se podían borrar, perdiendo el rastro de la
--    conciliación. Ahora no se borran (se pueden seguir conciliando y
--    reemplazar el comprobante).
--
-- Además, el rol de la API (simo_app) pierde el permiso DELETE en todas las
-- tablas con historial: la API nunca borra, inactiva. Conserva DELETE solo en
-- usuarios (las llaves protegen a quien tiene historial) y jwt_blacklist.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------- fn_registrar_venta en dos fases
-- Misma firma, reglas y errores que en 020. Fase 1: bloquea los productos (en
-- orden de id), valida y calcula el subtotal. Fase 2: inserta la venta ya
-- completa, sus líneas, el descuento en cascada y los movimientos.
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
    v_venta     ventas%ROWTYPE;
    v_linea     RECORD;
    v_producto  productos%ROWTYPE;
    v_decimal   BOOLEAN;
    v_de_alm    NUMERIC;
    v_de_bod    NUMERIC;
    v_subtotal  NUMERIC := 0;
    v_desc      NUMERIC := coalesce(p_descuento, 0);
    v_ids       INTEGER[] := '{}';
    v_cantidad  NUMERIC[] := '{}';
    k           INTEGER;
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

    -- Fase 1. Un producto repetido en la canasta se suma en una sola línea
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

        v_ids      := v_ids || v_linea.id_producto;
        v_cantidad := v_cantidad || v_linea.cantidad;
        v_subtotal := v_subtotal + round(v_linea.cantidad * v_producto.precio_venta, 2);
    END LOOP;

    IF v_desc > v_subtotal THEN
        RAISE EXCEPTION 'El descuento (%) no puede ser mayor que el subtotal (%)', v_desc, v_subtotal
            USING ERRCODE = 'SM023';
    END IF;

    -- Fase 2. La venta se inserta ya completa (no se vuelve a modificar)
    INSERT INTO ventas (id_cliente, id_usuario, id_metodo_pago, subtotal, descuento, total, referencia_pago)
    VALUES (p_id_cliente, p_id_usuario, p_id_metodo_pago, v_subtotal, v_desc, v_subtotal - v_desc,
            NULLIF(btrim(p_referencia_pago), ''))
    RETURNING * INTO v_venta;

    FOR k IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
        -- Ya bloqueado en la fase 1: el stock no cambió desde entonces
        SELECT * INTO v_producto FROM productos WHERE id_producto = v_ids[k];
        v_de_alm := least(v_cantidad[k], v_producto.stock_almacen);
        v_de_bod := v_cantidad[k] - v_de_alm;

        INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, costo_unitario, subtotal_linea)
        VALUES (v_venta.id_venta, v_producto.id_producto, v_cantidad[k], v_producto.precio_venta,
                v_producto.precio_compra, round(v_cantidad[k] * v_producto.precio_venta, 2));

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

    RETURN v_venta;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_registrar_venta(INTEGER, INTEGER, JSONB, INTEGER, NUMERIC, VARCHAR) IS
    'Venta POS: valida stock total, descuenta en cascada Almacén -> Bodega y registra el Kardex (HU-07, RN-01, RN-02)';

-- ------------------------------------------------------------- 1. líneas de venta
DROP TRIGGER IF EXISTS trg_detalles_ventas_inalterable ON detalles_ventas;
CREATE TRIGGER trg_detalles_ventas_inalterable
    BEFORE UPDATE OR DELETE ON detalles_ventas
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_detalles_ventas_no_truncate ON detalles_ventas;
CREATE TRIGGER trg_detalles_ventas_no_truncate
    BEFORE TRUNCATE ON detalles_ventas
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- ------------------------------------------------------------- 2. ventas
CREATE OR REPLACE FUNCTION fn_venta_inalterable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'La venta % no se puede eliminar: las ventas se anulan', OLD.id_venta
            USING ERRCODE = 'SM034';
    END IF;

    -- Única modificación permitida: la anulación, con todo lo demás igual
    IF OLD.estado = 'COMPLETADA' AND NEW.estado = 'ANULADA'
       AND (NEW.id_cliente, NEW.id_usuario, NEW.id_pedido, NEW.id_metodo_pago, NEW.fecha_venta,
            NEW.subtotal, NEW.descuento, NEW.impuestos, NEW.total, NEW.referencia_pago)
           IS NOT DISTINCT FROM
           (OLD.id_cliente, OLD.id_usuario, OLD.id_pedido, OLD.id_metodo_pago, OLD.fecha_venta,
            OLD.subtotal, OLD.descuento, OLD.impuestos, OLD.total, OLD.referencia_pago) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'La venta % es inalterable: solo se puede anular (y una sola vez)', OLD.id_venta
        USING ERRCODE = 'SM034';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ventas_inalterable ON ventas;
CREATE TRIGGER trg_ventas_inalterable
    BEFORE UPDATE OR DELETE ON ventas
    FOR EACH ROW EXECUTE FUNCTION fn_venta_inalterable();

DROP TRIGGER IF EXISTS trg_ventas_no_truncate ON ventas;
CREATE TRIGGER trg_ventas_no_truncate
    BEFORE TRUNCATE ON ventas
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

COMMENT ON FUNCTION fn_venta_inalterable() IS
    'Una venta registrada solo cambia al anularse (una vez) y nunca se borra (SCRUM-174)';

-- ------------------------------------------------------------- 3. pagos digitales
CREATE OR REPLACE FUNCTION fn_pago_digital_no_se_borra()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'El pago de la venta % no se puede eliminar: queda como soporte de la conciliación', OLD.id_venta
        USING ERRCODE = 'SM034';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pagos_digitales_no_se_borran ON pagos_digitales;
CREATE TRIGGER trg_pagos_digitales_no_se_borran
    BEFORE DELETE ON pagos_digitales
    FOR EACH ROW EXECUTE FUNCTION fn_pago_digital_no_se_borra();

DROP TRIGGER IF EXISTS trg_pagos_digitales_no_truncate ON pagos_digitales;
CREATE TRIGGER trg_pagos_digitales_no_truncate
    BEFORE TRUNCATE ON pagos_digitales
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- ------------------------------------------------------------- permisos de la API
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'simo_app') THEN
        REVOKE DELETE, TRUNCATE ON
            ventas, detalles_ventas, pagos_digitales, clientes, productos, categorias,
            pedidos, detalles_pedidos, compras, detalles_compras, proveedores, empresa
            FROM simo_app;
        REVOKE UPDATE ON detalles_ventas FROM simo_app;
        -- Las tablas que creen migraciones futuras no traen DELETE para la API
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM simo_app;
    END IF;
END
$$;

COMMIT;
