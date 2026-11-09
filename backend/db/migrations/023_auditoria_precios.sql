-- =====================================================================
-- SIMO - Migración 023: auditoría de cambios de precio (SCRUM-77, RF-24)
-- Trigger: trg_productos_auditar_precio
--
-- El log de auditoría debe registrar ajustes manuales, anulaciones y cambios
-- de precio. Los dos primeros ya los escriben fn_registrar_ajuste (014),
-- fn_cambiar_estado_pedido (018) y fn_anular_venta (020), dentro de la misma
-- transacción de la operación. Faltaba el cambio de precio.
--
-- Se hace con un trigger y no en el servidor Node: así queda registrado
-- aunque el precio se cambie desde otro lugar, y en la misma transacción
-- (no puede existir el cambio sin su registro).
--
-- El usuario sale de set_config('simo.id_usuario', ...), que el backend fija
-- en PUT /api/products/:id. Sin usuario identificado el cambio se rechaza.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_auditar_cambio_precio()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario INTEGER := fn_usuario_sesion();
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Falta el usuario responsable del cambio de precio: ejecute set_config(''simo.id_usuario'', ...)'
            USING ERRCODE = 'not_null_violation';
    END IF;
    INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, datos_anteriores, datos_nuevos)
    VALUES (v_usuario, 'CAMBIO_PRECIO', 'productos', NEW.id_producto,
            jsonb_build_object('precio_compra', OLD.precio_compra, 'precio_venta', OLD.precio_venta),
            jsonb_build_object('precio_compra', NEW.precio_compra, 'precio_venta', NEW.precio_venta, 'sku', NEW.sku));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_auditar_precio ON productos;
CREATE TRIGGER trg_productos_auditar_precio
    AFTER UPDATE OF precio_compra, precio_venta ON productos
    FOR EACH ROW
    WHEN (OLD.precio_compra IS DISTINCT FROM NEW.precio_compra OR OLD.precio_venta IS DISTINCT FROM NEW.precio_venta)
    EXECUTE FUNCTION fn_auditar_cambio_precio();

COMMIT;
