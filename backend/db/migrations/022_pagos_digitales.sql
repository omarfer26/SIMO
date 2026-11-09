-- =====================================================================
-- SIMO - Migración 022: pagos por billetera virtual y su conciliación (SCRUM-78)
-- Tabla: pagos_digitales · Función: fn_conciliar_pago
-- Requisitos: RF-15 | SCRUM-73 (frontend), SCRUM-78
--
-- El pago con Nequi, Daviplata o transferencia sigue siendo informativo: no
-- hay integración con el banco. Lo que el sistema guarda es el SOPORTE para
-- que el Gerente pueda revisar después que el dinero sí llegó:
--   * el código de referencia que el cliente muestra en su comprobante;
--   * el comprobante (imagen o PDF, máximo 5 MB), opcional;
--   * el resultado de la conciliación manual: PENDIENTE -> CONCILIADO o
--     RECHAZADO, con quién la hizo, cuándo y su observación.
--
-- Cada venta con uno de esos métodos crea su fila PENDIENTE automáticamente
-- (trigger), venga del POS o de un pedido convertido en venta.
--
-- Errores: SM031 la venta no tiene pago digital · SM032 estado de
--          conciliación inválido o venta anulada · SM015 observación
--          obligatoria al rechazar · SM030 quien concilia debe ser GERENTE o ADMIN
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pagos_digitales (
    id_pago                SERIAL PRIMARY KEY,
    id_venta               INTEGER     NOT NULL UNIQUE REFERENCES ventas(id_venta) ON DELETE RESTRICT,
    referencia             VARCHAR(40),
    estado                 VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                           CHECK (estado IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')),
    comprobante_nombre     VARCHAR(200),
    comprobante_tipo       VARCHAR(50)
                           CHECK (comprobante_tipo IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    comprobante_datos      BYTEA,
    comprobante_subido_por INTEGER     REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    comprobante_subido_en  TIMESTAMPTZ,
    conciliado_por         INTEGER     REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    conciliado_en          TIMESTAMPTZ,
    observacion            TEXT,
    creado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pagos_comprobante CHECK (
        (comprobante_datos IS NULL AND comprobante_nombre IS NULL AND comprobante_tipo IS NULL)
        OR (comprobante_datos IS NOT NULL AND comprobante_nombre IS NOT NULL AND comprobante_tipo IS NOT NULL
            AND octet_length(comprobante_datos) BETWEEN 1 AND 5242880)
    ),
    CONSTRAINT chk_pagos_conciliacion CHECK (
        (estado = 'PENDIENTE' AND conciliado_por IS NULL AND conciliado_en IS NULL)
        OR (estado <> 'PENDIENTE' AND conciliado_por IS NOT NULL AND conciliado_en IS NOT NULL)
    ),
    CONSTRAINT chk_pagos_rechazo CHECK (estado <> 'RECHAZADO' OR btrim(coalesce(observacion, '')) <> '')
);

COMMENT ON TABLE pagos_digitales IS 'Soporte y conciliación manual de pagos por Nequi, Daviplata y transferencia (SCRUM-78)';
COMMENT ON COLUMN pagos_digitales.referencia IS 'Código del comprobante que muestra el cliente';
COMMENT ON COLUMN pagos_digitales.comprobante_datos IS 'Imagen o PDF del comprobante, máximo 5 MB';

CREATE INDEX IF NOT EXISTS idx_pagos_digitales_pendientes ON pagos_digitales(creado_en) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_pagos_digitales_referencia ON pagos_digitales(referencia) WHERE referencia IS NOT NULL;

-- Cada venta con pago digital nace con su conciliación PENDIENTE
CREATE OR REPLACE FUNCTION fn_crear_pago_digital()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM metodos_pago
               WHERE id_metodo_pago = NEW.id_metodo_pago AND codigo IN ('NEQUI', 'DAVIPLATA', 'TRANSFERENCIA')) THEN
        INSERT INTO pagos_digitales (id_venta, referencia) VALUES (NEW.id_venta, NEW.referencia_pago)
        ON CONFLICT (id_venta) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ventas_pago_digital ON ventas;
CREATE TRIGGER trg_ventas_pago_digital
    AFTER INSERT ON ventas
    FOR EACH ROW EXECUTE FUNCTION fn_crear_pago_digital();

-- Conciliación manual (Gerente o Administrador)
CREATE OR REPLACE FUNCTION fn_conciliar_pago(
    p_id_venta    INTEGER,
    p_estado      VARCHAR,
    p_id_usuario  INTEGER,
    p_observacion TEXT    DEFAULT NULL,
    p_referencia  VARCHAR DEFAULT NULL
)
RETURNS pagos_digitales AS $$
DECLARE
    v_pago  pagos_digitales%ROWTYPE;
    v_venta ventas%ROWTYPE;
BEGIN
    IF p_estado IS NULL OR p_estado NOT IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO') THEN
        RAISE EXCEPTION 'El estado de conciliación debe ser CONCILIADO, RECHAZADO o PENDIENTE' USING ERRCODE = 'SM032';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
                   WHERE u.id_usuario = p_id_usuario AND u.estado AND r.codigo IN ('GERENTE', 'ADMIN')) THEN
        RAISE EXCEPTION 'La conciliación debe hacerla un Gerente o Administrador activo' USING ERRCODE = 'SM030';
    END IF;

    SELECT * INTO v_pago FROM pagos_digitales WHERE id_venta = p_id_venta FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La venta % no tiene un pago por billetera virtual o transferencia', p_id_venta
            USING ERRCODE = 'SM031';
    END IF;
    SELECT * INTO v_venta FROM ventas WHERE id_venta = p_id_venta;
    IF p_estado = 'CONCILIADO' AND v_venta.estado = 'ANULADA' THEN
        RAISE EXCEPTION 'La venta % está anulada: su pago no se puede conciliar', p_id_venta USING ERRCODE = 'SM032';
    END IF;
    IF p_estado = 'RECHAZADO' AND btrim(coalesce(p_observacion, '')) = '' THEN
        RAISE EXCEPTION 'Para rechazar un pago debe indicar la observación' USING ERRCODE = 'SM015';
    END IF;

    UPDATE pagos_digitales
       SET estado         = p_estado,
           referencia     = coalesce(NULLIF(btrim(p_referencia), ''), referencia),
           observacion    = NULLIF(btrim(p_observacion), ''),
           conciliado_por = CASE WHEN p_estado = 'PENDIENTE' THEN NULL ELSE p_id_usuario END,
           conciliado_en  = CASE WHEN p_estado = 'PENDIENTE' THEN NULL ELSE clock_timestamp() END
     WHERE id_venta = p_id_venta
    RETURNING * INTO v_pago;

    RETURN v_pago;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_conciliar_pago(INTEGER, VARCHAR, INTEGER, TEXT, VARCHAR) IS
    'Conciliación manual de un pago digital por un Gerente o Administrador (SCRUM-78)';

COMMIT;
