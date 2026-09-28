-- =====================================================================
-- SIMO - Migración 004: clientes y pedidos (SCRUM-84, SCRUM-52, SCRUM-60)
-- Tablas: clientes, pedidos, detalles_pedidos, historial_estados_pedido
-- Requisitos: RF-12, RF-17, RF-18, RF-19, RN-04 | CU-09, CU-12, CU-13
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- clientes (RF-12, CU-09)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente          SERIAL PRIMARY KEY,
    tipo_identificacion VARCHAR(5)   NOT NULL DEFAULT 'CC'
                        CHECK (tipo_identificacion IN ('CC', 'CE', 'NIT', 'TI', 'PAS')),
    identificacion      VARCHAR(30)  NOT NULL UNIQUE CHECK (btrim(identificacion) <> ''),
    nombre              VARCHAR(150) NOT NULL CHECK (btrim(nombre) <> ''),
    telefono            VARCHAR(30),
    correo              VARCHAR(150) CHECK (correo = lower(btrim(correo))),
    direccion           VARCHAR(200),
    estado              BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE clientes IS 'Clientes para trazabilidad de compras y pedidos - RF-12';

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(lower(nombre));

DROP TRIGGER IF EXISTS trg_clientes_actualizado_en ON clientes;
CREATE TRIGGER trg_clientes_actualizado_en
    BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- pedidos (RF-17, RF-18)
-- Ciclo: REGISTRADO -> CONFIRMADO -> EN_PREPARACION -> LISTO -> ENTREGADO
-- CANCELADO se permite desde cualquier estado previo a ENTREGADO (RN-04).
-- Un pedido está vencido si fecha_entrega_pactada < now() y no está
-- ENTREGADO ni CANCELADO (se calcula, no se guarda).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido             SERIAL PRIMARY KEY,
    id_cliente            INTEGER       NOT NULL REFERENCES clientes(id_cliente) ON DELETE RESTRICT,
    id_usuario            INTEGER       NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    estado                VARCHAR(20)   NOT NULL DEFAULT 'REGISTRADO'
                          CHECK (estado IN ('REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO')),
    fecha_solicitud       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fecha_entrega_pactada TIMESTAMPTZ   NOT NULL,
    direccion_entrega     VARCHAR(200),
    observaciones         TEXT,
    total                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    creado_en             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_pedidos_fechas CHECK (fecha_entrega_pactada >= fecha_solicitud)
);

COMMENT ON TABLE pedidos IS 'Pedidos de clientes con ciclo de vida estricto - RF-17, RF-18';
COMMENT ON COLUMN pedidos.id_usuario IS 'Usuario que registró el pedido';
COMMENT ON COLUMN pedidos.estado IS 'Solo avanza un paso a la vez; ver fn_validar_transicion_pedido (RN-04)';

CREATE INDEX IF NOT EXISTS idx_pedidos_id_cliente ON pedidos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
-- Apoya la consulta de pedidos vencidos / próximos a vencer (alertas, SCRUM-69)
CREATE INDEX IF NOT EXISTS idx_pedidos_abiertos_entrega ON pedidos(fecha_entrega_pactada)
    WHERE estado NOT IN ('ENTREGADO', 'CANCELADO');

DROP TRIGGER IF EXISTS trg_pedidos_actualizado_en ON pedidos;
CREATE TRIGGER trg_pedidos_actualizado_en
    BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- detalles_pedidos (RF-17)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detalles_pedidos (
    id_detalle_pedido SERIAL PRIMARY KEY,
    id_pedido         INTEGER       NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    id_producto       INTEGER       NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario   NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal_linea    NUMERIC(14,2) NOT NULL CHECK (subtotal_linea >= 0),
    CONSTRAINT uq_detalles_pedidos_producto UNIQUE (id_pedido, id_producto),
    CONSTRAINT chk_detalles_pedidos_subtotal CHECK (subtotal_linea = round(cantidad * precio_unitario, 2))
);

COMMENT ON TABLE detalles_pedidos IS 'Productos y cantidades de cada pedido - RF-17';

CREATE INDEX IF NOT EXISTS idx_detalles_pedidos_id_producto ON detalles_pedidos(id_producto);

-- ---------------------------------------------------------------------
-- historial_estados_pedido (RF-18: fecha, hora y usuario de cada cambio)
-- Se llena automáticamente por trigger; es inalterable.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_estados_pedido (
    id_historial    BIGSERIAL PRIMARY KEY,
    id_pedido       INTEGER     NOT NULL REFERENCES pedidos(id_pedido) ON DELETE RESTRICT,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20) NOT NULL,
    id_usuario      INTEGER     NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    motivo          TEXT,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_historial_motivo_cancelacion
        CHECK (estado_nuevo <> 'CANCELADO' OR btrim(coalesce(motivo, '')) <> '')
);

COMMENT ON TABLE historial_estados_pedido IS 'Trazabilidad inalterable de cambios de estado de pedidos - RF-18';

CREATE INDEX IF NOT EXISTS idx_historial_pedido ON historial_estados_pedido(id_pedido, fecha);

-- ---------------------------------------------------------------------
-- Reglas del ciclo de vida (RN-04, CU-12 RB-1, CU-13 RB-1)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_transicion_pedido()
RETURNS TRIGGER AS $$
DECLARE
    siguiente CONSTANT JSONB := '{"REGISTRADO": "CONFIRMADO",
                                  "CONFIRMADO": "EN_PREPARACION",
                                  "EN_PREPARACION": "LISTO",
                                  "LISTO": "ENTREGADO"}';
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.estado <> 'REGISTRADO' THEN
            RAISE EXCEPTION 'Un pedido nuevo debe iniciar en estado REGISTRADO'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.estado = OLD.estado THEN
        RETURN NEW;
    END IF;

    IF OLD.estado IN ('ENTREGADO', 'CANCELADO') THEN
        RAISE EXCEPTION 'El pedido % ya está % y no admite cambios de estado', OLD.id_pedido, OLD.estado
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.estado = 'CANCELADO' OR NEW.estado = siguiente ->> OLD.estado THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Transición de estado inválida: % -> % (el flujo es secuencial)', OLD.estado, NEW.estado
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_validar_transicion ON pedidos;
CREATE TRIGGER trg_pedidos_validar_transicion
    BEFORE INSERT OR UPDATE OF estado ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_validar_transicion_pedido();

-- Registra cada estado (incluido el inicial) con el usuario de la sesión.
-- El backend debe fijar simo.id_usuario (y simo.motivo al cancelar).
CREATE OR REPLACE FUNCTION fn_registrar_historial_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario INTEGER := fn_usuario_sesion();
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado = OLD.estado THEN
        RETURN NULL;
    END IF;

    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Falta el usuario responsable: ejecute set_config(''simo.id_usuario'', ...) antes de modificar pedidos'
            USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO historial_estados_pedido (id_pedido, estado_anterior, estado_nuevo, id_usuario, motivo)
    VALUES (
        NEW.id_pedido,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado END,
        NEW.estado,
        v_usuario,
        NULLIF(current_setting('simo.motivo', true), '')
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_historial ON pedidos;
CREATE TRIGGER trg_pedidos_historial
    AFTER INSERT OR UPDATE OF estado ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_registrar_historial_pedido();

DROP TRIGGER IF EXISTS trg_historial_pedido_inalterable ON historial_estados_pedido;
CREATE TRIGGER trg_historial_pedido_inalterable
    BEFORE UPDATE OR DELETE ON historial_estados_pedido
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

COMMIT;
