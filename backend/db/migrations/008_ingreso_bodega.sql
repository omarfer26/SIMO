-- =====================================================================
-- SIMO - Migración 008: ingreso de mercancía a Bodega (SCRUM-94 / HU-05)
-- Función: fn_registrar_ingreso_bodega
-- Requisitos: RF-07, RF-08, RF-11 | HU-005 | CU-05
--
-- Registra una compra a proveedor de forma atómica:
--   1. Bloquea la fila del producto (FOR UPDATE) para que dos ingresos
--      simultáneos no se pisen (RNF-04).
--   2. Incrementa EXCLUSIVAMENTE stock_bodega (CU-05 RB-1, RB-2).
--   3. Inserta el movimiento ENTRADA_COMPRA con los saldos resultantes,
--      que es lo que muestra el Kardex (CU-05 RB-3).
--
-- Los errores de negocio usan códigos SQLSTATE propios (clase SM) para
-- que la API los traduzca a respuestas HTTP sin depender del texto:
--   SM001 producto inexistente      SM004 cantidad debe ser entera
--   SM002 producto inactivo         SM005 usuario inexistente o inactivo
--   SM003 cantidad no positiva      SM006 proveedor inexistente o inactivo
--   SM007 costo unitario negativo
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_registrar_ingreso_bodega(
    p_id_producto          INTEGER,
    p_cantidad             NUMERIC,
    p_id_usuario           INTEGER,
    p_costo_unitario       NUMERIC DEFAULT NULL,   -- por defecto, el precio de compra del producto
    p_id_proveedor         INTEGER DEFAULT NULL,
    p_documento_referencia VARCHAR DEFAULT NULL,   -- p. ej. número de la factura del proveedor
    p_observacion          TEXT    DEFAULT NULL
)
RETURNS movimientos_inventario AS $$
DECLARE
    v_producto   productos%ROWTYPE;
    v_decimales  BOOLEAN;
    v_movimiento movimientos_inventario%ROWTYPE;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad ingresada debe ser mayor a cero' USING ERRCODE = 'SM003';
    END IF;
    IF p_costo_unitario IS NOT NULL AND p_costo_unitario < 0 THEN
        RAISE EXCEPTION 'El costo unitario no puede ser negativo' USING ERRCODE = 'SM007';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;
    IF p_id_proveedor IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM proveedores WHERE id_proveedor = p_id_proveedor AND estado) THEN
        RAISE EXCEPTION 'El proveedor % no existe o está inactivo', p_id_proveedor USING ERRCODE = 'SM006';
    END IF;

    -- Bloqueo de la fila: otra transacción sobre el mismo producto espera aquí.
    SELECT * INTO v_producto FROM productos WHERE id_producto = p_id_producto FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto % no existe', p_id_producto USING ERRCODE = 'SM001';
    END IF;
    IF NOT v_producto.estado THEN
        RAISE EXCEPTION 'El producto % está inactivo', v_producto.sku USING ERRCODE = 'SM002';
    END IF;

    SELECT permite_decimales INTO v_decimales FROM unidades_medida WHERE id_unidad = v_producto.id_unidad;
    IF NOT v_decimales AND p_cantidad <> trunc(p_cantidad) THEN
        RAISE EXCEPTION 'La cantidad de % debe ser un número entero', v_producto.sku USING ERRCODE = 'SM004';
    END IF;

    UPDATE productos
       SET stock_bodega = stock_bodega + p_cantidad
     WHERE id_producto = p_id_producto
    RETURNING * INTO v_producto;

    INSERT INTO movimientos_inventario (
        id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario,
        saldo_bodega, saldo_almacen, id_usuario, id_proveedor, documento_referencia, motivo
    ) VALUES (
        p_id_producto, 'ENTRADA_COMPRA', 'BODEGA', p_cantidad,
        coalesce(p_costo_unitario, v_producto.precio_compra),
        v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_proveedor,
        NULLIF(btrim(p_documento_referencia), ''), NULLIF(btrim(p_observacion), '')
    )
    RETURNING * INTO v_movimiento;

    RETURN v_movimiento;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_registrar_ingreso_bodega(INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, VARCHAR, TEXT) IS
    'Ingreso de compra a Bodega: suma stock_bodega y registra el movimiento ENTRADA_COMPRA en una sola operación (HU-005, CU-05)';

COMMIT;
