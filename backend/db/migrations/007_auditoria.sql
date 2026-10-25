-- =====================================================================
-- SIMO - Migración 007: log de auditoría inalterable (SCRUM-84, SCRUM-75)
-- Tabla: log_auditoria
-- Requisitos: RF-24, RNF-05 | HU-015 | CU-07, CU-11, CU-13, CU-16
--
-- El backend (interceptor de SCRUM-77) inserta aquí cada operación
-- crítica dentro de la MISMA transacción que la operación, de modo que
-- no pueda existir un ajuste o anulación sin su registro de auditoría.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS log_auditoria (
    id_log                 BIGSERIAL PRIMARY KEY,
    fecha                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    id_usuario             INTEGER     NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_usuario_autorizador INTEGER     REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    accion                 VARCHAR(30) NOT NULL CHECK (accion IN (
                               'AJUSTE_INVENTARIO',
                               'ANULACION_VENTA',
                               'CANCELACION_PEDIDO',
                               'CAMBIO_PRECIO',
                               'CAMBIO_ROL_USUARIO',
                               'CAMBIO_ESTADO_USUARIO',
                               'ACTUALIZACION_EMPRESA')),
    entidad                VARCHAR(50) NOT NULL,
    id_entidad             BIGINT      NOT NULL,
    justificacion          TEXT,
    datos_anteriores       JSONB,
    datos_nuevos           JSONB,
    direccion_ip           INET,

    CONSTRAINT chk_auditoria_justificacion CHECK (
        accion NOT IN ('AJUSTE_INVENTARIO', 'ANULACION_VENTA', 'CANCELACION_PEDIDO')
        OR btrim(coalesce(justificacion, '')) <> ''
    ),
    CONSTRAINT chk_auditoria_autorizador CHECK (
        accion <> 'ANULACION_VENTA' OR id_usuario_autorizador IS NOT NULL
    )
);

COMMENT ON TABLE log_auditoria IS 'Bitácora inalterable de operaciones críticas (RF-24, HU-015)';
COMMENT ON COLUMN log_auditoria.id_usuario IS 'Usuario que ejecutó la operación';
COMMENT ON COLUMN log_auditoria.id_usuario_autorizador IS 'Gerente/Administrador que autorizó (obligatorio en anulaciones, CU-11 RB-3)';
COMMENT ON COLUMN log_auditoria.entidad IS 'Tabla afectada: productos, ventas, pedidos, usuarios, empresa';
COMMENT ON COLUMN log_auditoria.justificacion IS 'Causa escrita; obligatoria en ajustes, anulaciones y cancelaciones';

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON log_auditoria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON log_auditoria(entidad, id_entidad);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON log_auditoria(id_usuario);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON log_auditoria(accion);

-- Inalterable: se bloquea UPDATE, DELETE y TRUNCATE incluso para el
-- dueño de la tabla (el REVOKE solo no alcanza para el owner).
DROP TRIGGER IF EXISTS trg_auditoria_inalterable ON log_auditoria;
CREATE TRIGGER trg_auditoria_inalterable
    BEFORE UPDATE OR DELETE ON log_auditoria
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_auditoria_no_truncate ON log_auditoria;
CREATE TRIGGER trg_auditoria_no_truncate
    BEFORE TRUNCATE ON log_auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

REVOKE UPDATE, DELETE, TRUNCATE ON log_auditoria FROM PUBLIC;

COMMIT;
