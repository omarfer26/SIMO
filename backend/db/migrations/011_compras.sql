-- =====================================================================
-- SIMO - Migración 011: compras a proveedor y su confirmación (SCRUM-45)
-- Tablas: compras, detalles_compras
-- Procedimiento: sp_confirmar_compra
-- Requisitos: RF-07, RF-08, RF-11 | HU-005 | CU-05
--
-- Una compra se registra en BORRADOR con sus líneas. Al confirmarla, el
-- procedimiento suma a Bodega TODAS las líneas en una sola operación: si
-- una línea falla (producto inactivo, cantidad inválida...), no se aplica
-- ninguna. Cada movimiento del Kardex queda enlazado a su compra.
--
-- Errores de negocio (SQLSTATE, mismo esquema que la migración 008):
--   SM010 la compra confirmada no admite cambios en sus líneas
--   SM011 la compra ya fue confirmada
--   SM012 la compra no existe
--   SM013 la compra no tiene líneas
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS compras (
    id_compra            SERIAL PRIMARY KEY,
    id_proveedor         INTEGER       REFERENCES proveedores(id_proveedor) ON DELETE RESTRICT,
    documento_referencia VARCHAR(100),
    observacion          TEXT,
    estado               VARCHAR(12)   NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'CONFIRMADA')),
    total                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    id_usuario           INTEGER       NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    confirmada_por       INTEGER       REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    confirmada_en        TIMESTAMPTZ,
    creado_en            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_compras_confirmacion CHECK (
        (estado = 'BORRADOR' AND confirmada_por IS NULL AND confirmada_en IS NULL)
        OR (estado = 'CONFIRMADA' AND confirmada_por IS NOT NULL AND confirmada_en IS NOT NULL)
    )
);

COMMENT ON TABLE compras IS 'Compras a proveedor; al confirmarse ingresan a Bodega (SCRUM-45, RF-08)';

CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras(estado);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(id_proveedor);

DROP TRIGGER IF EXISTS trg_compras_actualizado_en ON compras;
CREATE TRIGGER trg_compras_actualizado_en
    BEFORE UPDATE ON compras
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TABLE IF NOT EXISTS detalles_compras (
    id_detalle_compra SERIAL PRIMARY KEY,
    id_compra         INTEGER       NOT NULL REFERENCES compras(id_compra) ON DELETE CASCADE,
    id_producto       INTEGER       NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    costo_unitario    NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
    subtotal_linea    NUMERIC(14,2) GENERATED ALWAYS AS (round(cantidad * costo_unitario, 2)) STORED,
    CONSTRAINT uq_detalles_compras_producto UNIQUE (id_compra, id_producto)
);

COMMENT ON TABLE detalles_compras IS 'Líneas de cada compra a proveedor (SCRUM-45)';

CREATE INDEX IF NOT EXISTS idx_detalles_compras_producto ON detalles_compras(id_producto);

-- ---------------------------------------------------------------------
-- Una compra confirmada es inalterable: ni sus líneas ni sus datos cambian
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_detalles_compra_editables()
RETURNS TRIGGER AS $$
DECLARE
    v_estado VARCHAR;
BEGIN
    SELECT estado INTO v_estado FROM compras WHERE id_compra = coalesce(NEW.id_compra, OLD.id_compra);
    IF v_estado = 'CONFIRMADA' THEN
        RAISE EXCEPTION 'La compra % ya fue confirmada: sus líneas no se pueden modificar',
            coalesce(NEW.id_compra, OLD.id_compra) USING ERRCODE = 'SM010';
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_detalles_compras_editables ON detalles_compras;
CREATE TRIGGER trg_detalles_compras_editables
    BEFORE INSERT OR UPDATE OR DELETE ON detalles_compras
    FOR EACH ROW EXECUTE FUNCTION fn_detalles_compra_editables();

-- Mantiene compras.total como la suma de sus líneas
CREATE OR REPLACE FUNCTION fn_recalcular_total_compra()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE compras
       SET total = (SELECT coalesce(sum(subtotal_linea), 0) FROM detalles_compras
                    WHERE id_compra = coalesce(NEW.id_compra, OLD.id_compra))
     WHERE id_compra = coalesce(NEW.id_compra, OLD.id_compra);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_detalles_compras_total ON detalles_compras;
CREATE TRIGGER trg_detalles_compras_total
    AFTER INSERT OR UPDATE OR DELETE ON detalles_compras
    FOR EACH ROW EXECUTE FUNCTION fn_recalcular_total_compra();

CREATE OR REPLACE FUNCTION fn_compra_confirmada_inalterable()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.estado = 'CONFIRMADA' AND (
        NEW.estado IS DISTINCT FROM OLD.estado
        OR NEW.id_proveedor IS DISTINCT FROM OLD.id_proveedor
        OR NEW.documento_referencia IS DISTINCT FROM OLD.documento_referencia
        OR NEW.total IS DISTINCT FROM OLD.total
        OR NEW.confirmada_por IS DISTINCT FROM OLD.confirmada_por
        OR NEW.confirmada_en IS DISTINCT FROM OLD.confirmada_en
    ) THEN
        RAISE EXCEPTION 'La compra % ya fue confirmada y no se puede modificar', OLD.id_compra
            USING ERRCODE = 'SM011';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compras_confirmada_inalterable ON compras;
CREATE TRIGGER trg_compras_confirmada_inalterable
    BEFORE UPDATE ON compras
    FOR EACH ROW EXECUTE FUNCTION fn_compra_confirmada_inalterable();

-- ---------------------------------------------------------------------
-- Enlace movimiento -> compra (trazabilidad Compra -> Kardex)
-- ---------------------------------------------------------------------
ALTER TABLE movimientos_inventario
    ADD COLUMN IF NOT EXISTS id_compra INTEGER REFERENCES compras(id_compra) ON DELETE RESTRICT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_movimiento_compra') THEN
        ALTER TABLE movimientos_inventario
            ADD CONSTRAINT chk_movimiento_compra CHECK (id_compra IS NULL OR tipo_movimiento = 'ENTRADA_COMPRA');
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_movimientos_compra ON movimientos_inventario(id_compra) WHERE id_compra IS NOT NULL;

-- La función de ingreso (migración 008) recibe ahora la compra de origen.
-- Se elimina la firma anterior para no dejar dos versiones ambiguas.
DROP FUNCTION IF EXISTS fn_registrar_ingreso_bodega(INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION fn_registrar_ingreso_bodega(
    p_id_producto          INTEGER,
    p_cantidad             NUMERIC,
    p_id_usuario           INTEGER,
    p_costo_unitario       NUMERIC DEFAULT NULL,
    p_id_proveedor         INTEGER DEFAULT NULL,
    p_documento_referencia VARCHAR DEFAULT NULL,
    p_observacion          TEXT    DEFAULT NULL,
    p_id_compra            INTEGER DEFAULT NULL
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
        saldo_bodega, saldo_almacen, id_usuario, id_proveedor, documento_referencia, motivo, id_compra
    ) VALUES (
        p_id_producto, 'ENTRADA_COMPRA', 'BODEGA', p_cantidad,
        coalesce(p_costo_unitario, v_producto.precio_compra),
        v_producto.stock_bodega, v_producto.stock_almacen, p_id_usuario, p_id_proveedor,
        NULLIF(btrim(p_documento_referencia), ''), NULLIF(btrim(p_observacion), ''), p_id_compra
    )
    RETURNING * INTO v_movimiento;

    RETURN v_movimiento;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_registrar_ingreso_bodega(INTEGER, NUMERIC, INTEGER, NUMERIC, INTEGER, VARCHAR, TEXT, INTEGER) IS
    'Ingreso de compra a Bodega: suma stock_bodega y registra el movimiento ENTRADA_COMPRA en una sola operación (HU-005, CU-05)';

-- ---------------------------------------------------------------------
-- sp_confirmar_compra: suma a Bodega todas las líneas de una compra
--   CALL sp_confirmar_compra(id_compra, id_usuario);
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_confirmar_compra(p_id_compra INTEGER, p_id_usuario INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_compra compras%ROWTYPE;
    v_linea  RECORD;
    v_lineas INTEGER := 0;
BEGIN
    -- Bloquea la compra: dos confirmaciones simultáneas no pueden aplicarla dos veces
    SELECT * INTO v_compra FROM compras WHERE id_compra = p_id_compra FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La compra % no existe', p_id_compra USING ERRCODE = 'SM012';
    END IF;
    IF v_compra.estado = 'CONFIRMADA' THEN
        RAISE EXCEPTION 'La compra % ya fue confirmada', p_id_compra USING ERRCODE = 'SM011';
    END IF;

    -- Orden fijo por producto para que compras simultáneas bloqueen en el mismo orden
    FOR v_linea IN
        SELECT id_producto, cantidad, costo_unitario
        FROM detalles_compras WHERE id_compra = p_id_compra
        ORDER BY id_producto
    LOOP
        PERFORM fn_registrar_ingreso_bodega(
            v_linea.id_producto, v_linea.cantidad, p_id_usuario, v_linea.costo_unitario,
            v_compra.id_proveedor, v_compra.documento_referencia,
            'Compra #' || p_id_compra, p_id_compra
        );
        v_lineas := v_lineas + 1;
    END LOOP;

    IF v_lineas = 0 THEN
        RAISE EXCEPTION 'La compra % no tiene líneas', p_id_compra USING ERRCODE = 'SM013';
    END IF;

    UPDATE compras
       SET estado = 'CONFIRMADA', confirmada_por = p_id_usuario, confirmada_en = now()
     WHERE id_compra = p_id_compra;
END;
$$;

COMMENT ON PROCEDURE sp_confirmar_compra(INTEGER, INTEGER) IS
    'Confirma una compra: ingresa todas sus líneas a Bodega en una sola operación (SCRUM-45)';

COMMIT;
