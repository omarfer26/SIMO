-- =====================================================================
-- SIMO - Migración 021: traslados internos Bodega -> Almacén (HU-06, CU-06)
-- Función: fn_registrar_traslado
-- Requisitos: RF-09, RN-01 | SCRUM-95, SCRUM-124
--
-- Surtir el mostrador: pasa unidades de Bodega al Almacén. En una sola
-- operación bloquea el producto, resta de stock_bodega, suma a
-- stock_almacen y registra el movimiento TRASLADO_INTERNO en el Kardex.
-- El stock total no cambia.
--
-- id_responsable: quien entrega y firma el traslado (el formulario del
-- frontend lo pide). Puede ser distinto de quien lo registra (id_usuario).
--
-- Errores: SM001 producto inexistente · SM002 inactivo · SM003 cantidad <= 0
--          SM004 cantidad debe ser entera · SM005 usuario o responsable
--          inexistente o inactivo · SM014 stock insuficiente en Bodega
-- =====================================================================

BEGIN;

ALTER TABLE movimientos_inventario
    ADD COLUMN IF NOT EXISTS id_responsable INTEGER REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
COMMENT ON COLUMN movimientos_inventario.id_responsable IS
    'Quien entrega y firma el traslado interno (HU-06); id_usuario es quien lo registra';

CREATE OR REPLACE FUNCTION fn_registrar_traslado(
    p_id_producto    INTEGER,
    p_cantidad       NUMERIC,
    p_id_usuario     INTEGER,
    p_id_responsable INTEGER DEFAULT NULL,
    p_motivo         TEXT    DEFAULT NULL
)
RETURNS movimientos_inventario AS $$
DECLARE
    v_producto   productos%ROWTYPE;
    v_decimales  BOOLEAN;
    v_movimiento movimientos_inventario%ROWTYPE;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad a trasladar debe ser mayor a cero' USING ERRCODE = 'SM003';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
    END IF;
    IF p_id_responsable IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_responsable AND estado) THEN
        RAISE EXCEPTION 'El responsable % no existe o está inactivo', p_id_responsable USING ERRCODE = 'SM005';
    END IF;

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
    IF p_cantidad > v_producto.stock_bodega THEN
        RAISE EXCEPTION 'Stock insuficiente en Bodega: hay % y se intenta trasladar %',
            trim_scale(v_producto.stock_bodega), trim_scale(p_cantidad) USING ERRCODE = 'SM014';
    END IF;

    UPDATE productos
       SET stock_bodega = stock_bodega - p_cantidad, stock_almacen = stock_almacen + p_cantidad
     WHERE id_producto = p_id_producto
    RETURNING * INTO v_producto;

    INSERT INTO movimientos_inventario (
        id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad, costo_unitario,
        saldo_bodega, saldo_almacen, id_usuario, id_responsable, motivo
    ) VALUES (
        p_id_producto, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', p_cantidad, v_producto.precio_compra,
        v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario,
        coalesce(p_id_responsable, p_id_usuario), NULLIF(btrim(p_motivo), '')
    )
    RETURNING * INTO v_movimiento;

    RETURN v_movimiento;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_registrar_traslado(INTEGER, NUMERIC, INTEGER, INTEGER, TEXT) IS
    'Traslado interno Bodega -> Almacén con movimiento en el Kardex (HU-06, RF-09)';

COMMIT;
