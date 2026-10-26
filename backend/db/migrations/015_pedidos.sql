-- =====================================================================
-- SIMO - Migración 015: reglas de las líneas de pedido (SCRUM-81)
-- Requisitos: RF-17, RN-04 | CU-12
--
-- 004 creó pedidos, detalles_pedidos y el ciclo de estados con su historial.
-- Faltaban las reglas de las líneas, que aquí garantiza la base de datos
-- aunque el pedido se escriba desde otro lugar que no sea la API:
--
--   1. El total del pedido se recalcula con cada cambio en sus líneas
--      (igual que compras, migración 011).
--   2. Las líneas solo se pueden agregar, cambiar o quitar mientras el pedido
--      está REGISTRADO o CONFIRMADO. Al pasar a EN_PREPARACION se descuenta
--      el stock (SCRUM-61), así que desde ahí las cantidades quedan fijas.
--   3. Cada línea debe ser de un producto activo y respetar su unidad
--      (entera si el producto no admite decimales).
--
-- Errores: SM002 producto inactivo · SM004 cantidad debe ser entera ·
--          SM017 el pedido ya no admite cambios en sus líneas
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------- 1. total
CREATE OR REPLACE FUNCTION fn_recalcular_total_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_pedido INTEGER := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_pedido ELSE NEW.id_pedido END;
BEGIN
    UPDATE pedidos
       SET total = coalesce((SELECT sum(subtotal_linea) FROM detalles_pedidos WHERE id_pedido = v_pedido), 0)
     WHERE id_pedido = v_pedido;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_detalles_pedidos_total ON detalles_pedidos;
CREATE TRIGGER trg_detalles_pedidos_total
    AFTER INSERT OR UPDATE OR DELETE ON detalles_pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_recalcular_total_pedido();

-- ------------------------------------------- 2 y 3. líneas editables y válidas
CREATE OR REPLACE FUNCTION fn_validar_detalle_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_estado    VARCHAR;
    v_producto  RECORD;
BEGIN
    SELECT estado INTO v_estado
      FROM pedidos
     WHERE id_pedido = CASE WHEN TG_OP = 'DELETE' THEN OLD.id_pedido ELSE NEW.id_pedido END;

    -- Sin pedido: el DELETE viene en cascada del propio pedido
    IF v_estado IS NOT NULL AND v_estado NOT IN ('REGISTRADO', 'CONFIRMADO') THEN
        RAISE EXCEPTION 'El pedido está % y ya no admite cambios en sus productos', v_estado
            USING ERRCODE = 'SM017';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT p.sku, p.estado, u.permite_decimales INTO v_producto
      FROM productos p JOIN unidades_medida u ON u.id_unidad = p.id_unidad
     WHERE p.id_producto = NEW.id_producto;
    -- Producto inexistente: lo rechaza la llave foránea (23503)
    IF FOUND THEN
        IF NOT v_producto.estado THEN
            RAISE EXCEPTION 'El producto % está inactivo', v_producto.sku USING ERRCODE = 'SM002';
        END IF;
        IF NOT v_producto.permite_decimales AND NEW.cantidad <> trunc(NEW.cantidad) THEN
            RAISE EXCEPTION 'La cantidad de % debe ser un número entero', v_producto.sku USING ERRCODE = 'SM004';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_detalles_pedidos_validar ON detalles_pedidos;
CREATE TRIGGER trg_detalles_pedidos_validar
    BEFORE INSERT OR UPDATE OR DELETE ON detalles_pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_validar_detalle_pedido();

COMMENT ON FUNCTION fn_validar_detalle_pedido() IS
    'Líneas de pedido editables solo en REGISTRADO/CONFIRMADO, producto activo y cantidad según su unidad (SCRUM-81)';

COMMIT;
