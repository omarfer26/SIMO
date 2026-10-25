-- =====================================================================
-- SIMO - Migración 006: inventario y Kardex (SCRUM-84, basada en SCRUM-41)
-- Tablas: proveedores, movimientos_inventario | Vista: v_kardex
-- Requisitos: RF-07, RF-08, RF-09, RF-10, RF-11, RN-02, RN-03
--             CU-05, CU-06, CU-07, CU-08, CU-11, CU-13
--
-- Cambios frente a scripts/movimiento_inventario.sql y scripts/kardex.sql:
--   * cada movimiento indica ubicación de origen y/o destino (BODEGA /
--     ALMACEN) y guarda los saldos resultantes de ambas ubicaciones.
--   * nuevos tipos: TRASLADO_INTERNO, SALIDA_PEDIDO, REVERSO_VENTA,
--     REVERSO_PEDIDO. Se retiran las devoluciones, que no están en el alcance.
--   * la tabla kardex se reemplaza por la vista v_kardex: duplicaba los
--     datos del movimiento y solo tenía un saldo (no servía para Bodega /
--     Almacén). El Kardex queda como consulta cronológica del libro de
--     movimientos, que es inalterable.
--   * FK a usuarios, ventas, pedidos y proveedores para la trazabilidad
--     producto -> movimiento -> venta/pedido.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- proveedores (RF-08, opcional en el ingreso a Bodega)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedores (
    id_proveedor   SERIAL PRIMARY KEY,
    nit            VARCHAR(20)  NOT NULL UNIQUE CHECK (btrim(nit) <> ''),
    nombre         VARCHAR(150) NOT NULL CHECK (btrim(nombre) <> ''),
    telefono       VARCHAR(30),
    correo         VARCHAR(150) CHECK (correo = lower(btrim(correo))),
    estado         BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE proveedores IS 'Proveedores de mercancía (ingresos a Bodega, RF-08)';

DROP TRIGGER IF EXISTS trg_proveedores_actualizado_en ON proveedores;
CREATE TRIGGER trg_proveedores_actualizado_en
    BEFORE UPDATE ON proveedores
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- movimientos_inventario: libro inalterable de todo cambio de stock
--
-- Tipo              Origen          Destino         Referencia obligatoria
-- ENTRADA_COMPRA    -               BODEGA          (proveedor opcional)
-- TRASLADO_INTERNO  BODEGA          ALMACEN         -
-- SALIDA_VENTA      BODEGA/ALMACEN  -               id_venta
-- SALIDA_PEDIDO     BODEGA/ALMACEN  -               id_pedido
-- REVERSO_VENTA     -               BODEGA/ALMACEN  id_venta
-- REVERSO_PEDIDO    -               BODEGA/ALMACEN  id_pedido
-- AJUSTE_POSITIVO   -               BODEGA/ALMACEN  motivo
-- AJUSTE_NEGATIVO   BODEGA/ALMACEN  -               motivo
--
-- La deducción en cascada (RN-02) de una línea genera hasta dos filas
-- SALIDA_*: una desde ALMACEN y otra desde BODEGA. La anulación o
-- cancelación crea un REVERSO_* por cada una, hacia la misma ubicación.
-- saldo_bodega / saldo_almacen son los saldos del producto DESPUÉS del
-- movimiento; los calcula el procedimiento de stock (SCRUM-45).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id_movimiento        BIGSERIAL PRIMARY KEY,
    id_producto          INTEGER       NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    tipo_movimiento      VARCHAR(20)   NOT NULL CHECK (tipo_movimiento IN (
                             'ENTRADA_COMPRA', 'TRASLADO_INTERNO',
                             'SALIDA_VENTA', 'SALIDA_PEDIDO',
                             'REVERSO_VENTA', 'REVERSO_PEDIDO',
                             'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')),
    ubicacion_origen     VARCHAR(10)   CHECK (ubicacion_origen IN ('BODEGA', 'ALMACEN')),
    ubicacion_destino    VARCHAR(10)   CHECK (ubicacion_destino IN ('BODEGA', 'ALMACEN')),
    cantidad             NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    costo_unitario       NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
    saldo_bodega         NUMERIC(12,3) NOT NULL CHECK (saldo_bodega >= 0),
    saldo_almacen        NUMERIC(12,3) NOT NULL CHECK (saldo_almacen >= 0),
    id_usuario           INTEGER       NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_venta             INTEGER       REFERENCES ventas(id_venta) ON DELETE RESTRICT,
    id_pedido            INTEGER       REFERENCES pedidos(id_pedido) ON DELETE RESTRICT,
    id_proveedor         INTEGER       REFERENCES proveedores(id_proveedor) ON DELETE RESTRICT,
    documento_referencia VARCHAR(100),
    motivo               TEXT,
    fecha_movimiento     TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_movimiento_ubicaciones CHECK (
        CASE tipo_movimiento
            WHEN 'ENTRADA_COMPRA'   THEN ubicacion_origen IS NULL AND ubicacion_destino = 'BODEGA'
            WHEN 'TRASLADO_INTERNO' THEN ubicacion_origen = 'BODEGA' AND ubicacion_destino = 'ALMACEN'
            WHEN 'SALIDA_VENTA'     THEN ubicacion_origen IS NOT NULL AND ubicacion_destino IS NULL
            WHEN 'SALIDA_PEDIDO'    THEN ubicacion_origen IS NOT NULL AND ubicacion_destino IS NULL
            WHEN 'AJUSTE_NEGATIVO'  THEN ubicacion_origen IS NOT NULL AND ubicacion_destino IS NULL
            ELSE                         ubicacion_origen IS NULL AND ubicacion_destino IS NOT NULL
        END
    ),
    CONSTRAINT chk_movimiento_referencias CHECK (
        CASE tipo_movimiento
            WHEN 'SALIDA_VENTA'    THEN id_venta IS NOT NULL AND id_pedido IS NULL
            WHEN 'REVERSO_VENTA'   THEN id_venta IS NOT NULL AND id_pedido IS NULL
            WHEN 'SALIDA_PEDIDO'   THEN id_pedido IS NOT NULL AND id_venta IS NULL
            WHEN 'REVERSO_PEDIDO'  THEN id_pedido IS NOT NULL AND id_venta IS NULL
            ELSE                        id_venta IS NULL AND id_pedido IS NULL
        END
    ),
    CONSTRAINT chk_movimiento_proveedor CHECK (id_proveedor IS NULL OR tipo_movimiento = 'ENTRADA_COMPRA'),
    CONSTRAINT chk_movimiento_motivo_ajuste CHECK (
        tipo_movimiento NOT IN ('AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')
        OR btrim(coalesce(motivo, '')) <> ''
    )
);

COMMENT ON TABLE movimientos_inventario IS 'Libro inalterable de movimientos de stock (Kardex) - RF-08 a RF-11';
COMMENT ON COLUMN movimientos_inventario.costo_unitario IS 'Costo del producto al momento del movimiento (valorización)';
COMMENT ON COLUMN movimientos_inventario.saldo_bodega IS 'Saldo de Bodega después del movimiento';
COMMENT ON COLUMN movimientos_inventario.saldo_almacen IS 'Saldo de Almacén después del movimiento';
COMMENT ON COLUMN movimientos_inventario.motivo IS 'Justificación; obligatoria en ajustes manuales (RF-10)';

CREATE INDEX IF NOT EXISTS idx_movimientos_producto_fecha ON movimientos_inventario(id_producto, fecha_movimiento, id_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_inventario(fecha_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_venta ON movimientos_inventario(id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_pedido ON movimientos_inventario(id_pedido) WHERE id_pedido IS NOT NULL;

DROP TRIGGER IF EXISTS trg_movimientos_inalterable ON movimientos_inventario;
CREATE TRIGGER trg_movimientos_inalterable
    BEFORE UPDATE OR DELETE ON movimientos_inventario
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_movimientos_no_truncate ON movimientos_inventario;
CREATE TRIGGER trg_movimientos_no_truncate
    BEFORE TRUNCATE ON movimientos_inventario
    FOR EACH STATEMENT EXECUTE FUNCTION fn_bloquear_modificacion();

-- ---------------------------------------------------------------------
-- v_kardex (RF-11, CU-08): historial cronológico por producto con
-- entradas y salidas separadas por ubicación y saldos resultantes.
-- Uso: SELECT * FROM v_kardex WHERE id_producto = $1 ORDER BY fecha_movimiento, id_movimiento;
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kardex AS
SELECT
    m.id_movimiento,
    m.fecha_movimiento,
    m.id_producto,
    p.sku,
    p.nombre                                                         AS producto,
    m.tipo_movimiento,
    CASE WHEN m.ubicacion_destino = 'BODEGA'  THEN m.cantidad ELSE 0 END AS entrada_bodega,
    CASE WHEN m.ubicacion_origen  = 'BODEGA'  THEN m.cantidad ELSE 0 END AS salida_bodega,
    CASE WHEN m.ubicacion_destino = 'ALMACEN' THEN m.cantidad ELSE 0 END AS entrada_almacen,
    CASE WHEN m.ubicacion_origen  = 'ALMACEN' THEN m.cantidad ELSE 0 END AS salida_almacen,
    m.saldo_bodega,
    m.saldo_almacen,
    m.saldo_bodega + m.saldo_almacen                                 AS saldo_total,
    m.costo_unitario,
    m.id_venta,
    m.id_pedido,
    m.id_proveedor,
    m.documento_referencia,
    m.motivo,
    m.id_usuario,
    u.nombre_completo                                                AS usuario
FROM movimientos_inventario m
JOIN productos p ON p.id_producto = m.id_producto
JOIN usuarios  u ON u.id_usuario  = m.id_usuario;

COMMENT ON VIEW v_kardex IS 'Kardex cronológico por producto y ubicación (RF-11, CU-08)';

COMMIT;
