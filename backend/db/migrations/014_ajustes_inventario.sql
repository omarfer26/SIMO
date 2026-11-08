-- =====================================================================
-- SIMO - Migración 014: ajustes manuales de inventario (SCRUM-42)
-- Función: fn_registrar_ajuste
-- Requisitos: RF-10, RF-24 | CU-07 | HU-015
--
-- Un ajuste corrige el stock de UNA ubicación (mermas, daños, sobrantes de
-- conteo). En una sola operación, la función:
--   1. bloquea el producto (FOR UPDATE), para que dos ajustes o ventas
--      simultáneas no pierdan unidades;
--   2. suma o resta en stock_bodega o stock_almacen;
--   3. registra el movimiento AJUSTE_POSITIVO / AJUSTE_NEGATIVO en el Kardex
--      con el motivo y el usuario responsable;
--   4. registra la acción AJUSTE_INVENTARIO en log_auditoria con la
--      justificación y el stock antes y después (la 007 lo exige).
-- Si cualquier paso falla no queda nada: ni stock, ni movimiento, ni log.
--
-- Errores (SQLSTATE de la clase SM, igual que 008 y 011):
--   SM001 producto inexistente       SM002 producto inactivo
--   SM003 cantidad <= 0               SM004 cantidad debe ser entera
--   SM005 usuario inexistente/inact.  SM007 costo negativo
--   SM014 stock insuficiente en la ubicación (ajuste negativo)
--   SM015 motivo obligatorio          SM016 tipo o ubicación inválidos
--
-- Corrección del orden del Kardex con operaciones simultáneas:
--   fecha_movimiento tenía DEFAULT now(), que es la hora en que EMPEZÓ la
--   transacción. Si dos ajustes (o ingresos, o ventas) del mismo producto
--   corren a la vez, el que empezó primero puede obtener el bloqueo de
--   segundo: su movimiento queda con fecha anterior pero saldo posterior, y
--   el Kardex ordenado por fecha no cuadra (lo detectó la prueba de 20 ajustes
--   simultáneos). Con clock_timestamp() la fecha es la del INSERT, que todas
--   las funciones hacen después del FOR UPDATE: el orden por fecha coincide
--   con el orden real en que se aplicaron.
-- =====================================================================

BEGIN;

ALTER TABLE movimientos_inventario ALTER COLUMN fecha_movimiento SET DEFAULT clock_timestamp();

CREATE OR REPLACE FUNCTION fn_registrar_ajuste(
    p_id_producto     INTEGER,
    p_tipo_movimiento VARCHAR,
    p_ubicacion       VARCHAR,
    p_cantidad        NUMERIC,
    p_motivo          TEXT,
    p_id_usuario      INTEGER,
    p_costo_unitario  NUMERIC DEFAULT NULL
)
RETURNS movimientos_inventario AS $$
DECLARE
    v_producto   productos%ROWTYPE;
    v_antes      productos%ROWTYPE;
    v_decimales  BOOLEAN;
    v_positivo   BOOLEAN;
    v_disponible NUMERIC;
    v_movimiento movimientos_inventario%ROWTYPE;
BEGIN
    IF p_tipo_movimiento IS NULL OR p_tipo_movimiento NOT IN ('AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO') THEN
        RAISE EXCEPTION 'El tipo de ajuste debe ser AJUSTE_POSITIVO o AJUSTE_NEGATIVO' USING ERRCODE = 'SM016';
    END IF;
    IF p_ubicacion IS NULL OR p_ubicacion NOT IN ('BODEGA', 'ALMACEN') THEN
        RAISE EXCEPTION 'La ubicación debe ser BODEGA o ALMACEN' USING ERRCODE = 'SM016';
    END IF;
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad del ajuste debe ser mayor a cero' USING ERRCODE = 'SM003';
    END IF;
    IF btrim(coalesce(p_motivo, '')) = '' THEN
        RAISE EXCEPTION 'El motivo del ajuste es obligatorio' USING ERRCODE = 'SM015';
    END IF;
    IF p_costo_unitario IS NOT NULL AND p_costo_unitario < 0 THEN
        RAISE EXCEPTION 'El costo unitario no puede ser negativo' USING ERRCODE = 'SM007';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id_usuario = p_id_usuario AND estado) THEN
        RAISE EXCEPTION 'El usuario % no existe o está inactivo', p_id_usuario USING ERRCODE = 'SM005';
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

    v_positivo := p_tipo_movimiento = 'AJUSTE_POSITIVO';
    IF NOT v_positivo THEN
        v_disponible := CASE p_ubicacion WHEN 'BODEGA' THEN v_producto.stock_bodega ELSE v_producto.stock_almacen END;
        IF p_cantidad > v_disponible THEN
            RAISE EXCEPTION 'Stock insuficiente en %: hay % y se intenta retirar %',
                CASE p_ubicacion WHEN 'BODEGA' THEN 'Bodega' ELSE 'Almacén' END,
                trim_scale(v_disponible), trim_scale(p_cantidad)
                USING ERRCODE = 'SM014';
        END IF;
    END IF;

    v_antes := v_producto;
    UPDATE productos
       SET stock_bodega  = stock_bodega  + CASE WHEN p_ubicacion = 'BODEGA'
                                                THEN CASE WHEN v_positivo THEN p_cantidad ELSE -p_cantidad END ELSE 0 END,
           stock_almacen = stock_almacen + CASE WHEN p_ubicacion = 'ALMACEN'
                                                THEN CASE WHEN v_positivo THEN p_cantidad ELSE -p_cantidad END ELSE 0 END
     WHERE id_producto = p_id_producto
    RETURNING * INTO v_producto;

    -- chk_movimiento_ubicaciones: el positivo entra a la ubicación (destino),
    -- el negativo sale de ella (origen)
    INSERT INTO movimientos_inventario (
        id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad, costo_unitario,
        saldo_bodega, saldo_almacen, id_usuario, motivo
    ) VALUES (
        p_id_producto, p_tipo_movimiento,
        CASE WHEN v_positivo THEN NULL ELSE p_ubicacion END,
        CASE WHEN v_positivo THEN p_ubicacion END,
        p_cantidad, coalesce(p_costo_unitario, v_producto.precio_compra),
        v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, btrim(p_motivo)
    )
    RETURNING * INTO v_movimiento;

    INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, justificacion, datos_anteriores, datos_nuevos)
    VALUES (
        p_id_usuario, 'AJUSTE_INVENTARIO', 'productos', p_id_producto, btrim(p_motivo),
        jsonb_build_object('stock_bodega', v_antes.stock_bodega, 'stock_almacen', v_antes.stock_almacen),
        jsonb_build_object('stock_bodega', v_producto.stock_bodega, 'stock_almacen', v_producto.stock_almacen,
                           'id_movimiento', v_movimiento.id_movimiento, 'tipo_movimiento', p_tipo_movimiento,
                           'ubicacion', p_ubicacion, 'cantidad', p_cantidad)
    );

    RETURN v_movimiento;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_registrar_ajuste(INTEGER, VARCHAR, VARCHAR, NUMERIC, TEXT, INTEGER, NUMERIC) IS
    'Ajuste manual de stock en Bodega o Almacén con movimiento en el Kardex y registro de auditoría (SCRUM-42, RF-10)';

COMMIT;
