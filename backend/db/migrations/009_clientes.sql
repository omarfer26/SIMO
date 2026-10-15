-- =====================================================================
-- SIMO - Migración 009: gestión de clientes (SCRUM-98 / HU-09)
-- Requisitos: RF-12 | HU-009 | CU-09
--
--   * Índice para la búsqueda rápida por documento ("empieza por"), que usa
--     el autocompletado del punto de venta (SCRUM-123).
--   * El documento de identidad es inalterable (CU-09 RB-1): un trigger
--     rechaza cualquier cambio de identificacion o tipo_identificacion con
--     el código SQLSTATE SM008.
-- =====================================================================

BEGIN;

-- La restricción UNIQUE ya crea un índice, pero con la intercalación de la
-- base no sirve para LIKE 'texto%'. varchar_pattern_ops sí lo permite.
CREATE INDEX IF NOT EXISTS idx_clientes_identificacion_prefijo
    ON clientes (identificacion varchar_pattern_ops);

CREATE OR REPLACE FUNCTION fn_documento_cliente_inalterable()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.identificacion IS DISTINCT FROM OLD.identificacion
       OR NEW.tipo_identificacion IS DISTINCT FROM OLD.tipo_identificacion THEN
        RAISE EXCEPTION 'El documento de identidad del cliente no se puede modificar'
            USING ERRCODE = 'SM008';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clientes_documento_inalterable ON clientes;
CREATE TRIGGER trg_clientes_documento_inalterable
    BEFORE UPDATE OF identificacion, tipo_identificacion ON clientes
    FOR EACH ROW EXECUTE FUNCTION fn_documento_cliente_inalterable();

COMMENT ON COLUMN clientes.identificacion IS
    'Documento de identidad: único e inalterable (CU-09 RB-1). Se guarda sin puntos ni espacios';

COMMIT;
