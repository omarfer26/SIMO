-- =====================================================================
-- SIMO - Migración 005: ventas (SCRUM-84, SCRUM-52)
-- Tablas: metodos_pago, ventas, detalles_ventas
-- Requisitos: RF-13, RF-14, RF-15, RF-16, RF-20, RN-03 | CU-10, CU-11
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- metodos_pago (RF-15)
-- Registro informativo: no hay integración bancaria ni facturación DIAN.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metodos_pago (
    id_metodo_pago SERIAL PRIMARY KEY,
    codigo         VARCHAR(20) NOT NULL UNIQUE CHECK (codigo = upper(codigo)),
    nombre         VARCHAR(50) NOT NULL UNIQUE,
    estado         BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE metodos_pago IS 'Métodos de pago informativos (RF-15)';

INSERT INTO metodos_pago (codigo, nombre) VALUES
    ('EFECTIVO',      'Efectivo'),
    ('NEQUI',         'Nequi'),
    ('DAVIPLATA',     'Daviplata'),
    ('TRANSFERENCIA', 'Transferencia bancaria'),
    ('TARJETA',       'Tarjeta débito/crédito'),
    ('OTRO',          'Otro')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- ventas (RF-13, RF-16, RF-20)
-- id_cliente es opcional (venta de mostrador a consumidor final).
-- id_pedido se llena cuando la venta proviene de un pedido entregado
-- (RF-20); en ese caso el inventario ya se descontó al preparar el
-- pedido y la venta NO genera movimientos nuevos.
-- Anulación (CU-11): guarda quién ejecutó, quién autorizó (Gerente o
-- Administrador) y la causa escrita obligatoria.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ventas (
    id_venta         SERIAL PRIMARY KEY,
    id_cliente       INTEGER       REFERENCES clientes(id_cliente) ON DELETE RESTRICT,
    id_usuario       INTEGER       NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_pedido        INTEGER       UNIQUE REFERENCES pedidos(id_pedido) ON DELETE RESTRICT,
    id_metodo_pago   INTEGER       NOT NULL REFERENCES metodos_pago(id_metodo_pago) ON DELETE RESTRICT,
    fecha_venta      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    descuento        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    impuestos        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (impuestos >= 0),
    total            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    estado           VARCHAR(12)   NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('COMPLETADA', 'ANULADA')),
    anulada_en       TIMESTAMPTZ,
    anulada_por      INTEGER       REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    autorizada_por   INTEGER       REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    motivo_anulacion TEXT,
    CONSTRAINT chk_ventas_descuento CHECK (descuento <= subtotal),
    CONSTRAINT chk_ventas_total CHECK (total = subtotal - descuento + impuestos),
    CONSTRAINT chk_ventas_anulacion CHECK (
        (estado = 'COMPLETADA'
            AND anulada_en IS NULL AND anulada_por IS NULL
            AND autorizada_por IS NULL AND motivo_anulacion IS NULL)
        OR
        (estado = 'ANULADA'
            AND anulada_en IS NOT NULL AND anulada_por IS NOT NULL
            AND autorizada_por IS NOT NULL AND btrim(coalesce(motivo_anulacion, '')) <> '')
    )
);

COMMENT ON TABLE ventas IS 'Transacciones de venta - RF-13, RF-15, RF-16';
COMMENT ON COLUMN ventas.id_usuario IS 'Vendedor que registró la venta';
COMMENT ON COLUMN ventas.id_pedido IS 'Pedido entregado del que proviene la venta (RF-20). Único: un pedido genera como máximo una venta';
COMMENT ON COLUMN ventas.anulada_por IS 'Usuario que ejecutó la anulación (CU-11)';
COMMENT ON COLUMN ventas.autorizada_por IS 'Gerente o Administrador que autorizó la anulación (CU-11 RB-1)';

CREATE INDEX IF NOT EXISTS idx_ventas_id_cliente ON ventas(id_cliente);
CREATE INDEX IF NOT EXISTS idx_ventas_id_usuario ON ventas(id_usuario);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_completadas ON ventas(fecha_venta) WHERE estado = 'COMPLETADA';

-- ---------------------------------------------------------------------
-- detalles_ventas (RF-13)
-- costo_unitario congela el precio de compra al momento de la venta
-- para calcular márgenes en el dashboard aunque el costo cambie luego.
-- El desglose Almacén/Bodega de la deducción en cascada queda en
-- movimientos_inventario (migración 006), que es lo que usa la anulación
-- para devolver cada cantidad a su ubicación de origen.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detalles_ventas (
    id_detalle_venta SERIAL PRIMARY KEY,
    id_venta         INTEGER       NOT NULL REFERENCES ventas(id_venta) ON DELETE RESTRICT,
    id_producto      INTEGER       NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    cantidad         NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    costo_unitario   NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
    subtotal_linea   NUMERIC(14,2) NOT NULL CHECK (subtotal_linea >= 0),
    CONSTRAINT uq_detalles_ventas_producto UNIQUE (id_venta, id_producto),
    CONSTRAINT chk_detalles_ventas_subtotal CHECK (subtotal_linea = round(cantidad * precio_unitario, 2))
);

COMMENT ON TABLE detalles_ventas IS 'Líneas de producto de cada venta - RF-13';

CREATE INDEX IF NOT EXISTS idx_detalles_ventas_id_producto ON detalles_ventas(id_producto);

COMMIT;
