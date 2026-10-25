-- =====================================================================
-- SIMO - Migración 003: catálogo de productos (SCRUM-84, basada en SCRUM-32)
-- Tablas: unidades_medida, categorias, productos
-- Requisitos: RF-05, RF-06, RF-07 | HU-004 | CU-04
--
-- Cambios frente a scripts/producto.sql (SCRUM-32):
--   * stock_actual  -> stock_bodega + stock_almacen (inventario dual, RF-07)
--   * stock_minimo  -> stock_minimo_bodega + stock_minimo_almacen (HU-004, HU-014)
--   * codigo_barras -> sku, obligatorio y único (CU-04 EX-1)
--   * nueva FK a unidades_medida (RF-05) e imagen_url (visión: imágenes)
--   * cantidades NUMERIC(12,3) para soportar kilos, gramos y litros
--   * fechas TIMESTAMPTZ con el mismo nombre que el resto del esquema
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- unidades_medida (RF-05)
-- permite_decimales indica si la cantidad puede ser fraccionaria
-- (1,5 kg) o debe ser entera (3 unidades).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unidades_medida (
    id_unidad         SERIAL PRIMARY KEY,
    nombre            VARCHAR(30) NOT NULL UNIQUE,
    abreviatura       VARCHAR(10) NOT NULL UNIQUE,
    permite_decimales BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE unidades_medida IS 'Unidades de medida parametrizables del catálogo (RF-05)';

INSERT INTO unidades_medida (nombre, abreviatura, permite_decimales) VALUES
    ('Unidad',    'und', FALSE),
    ('Kilogramo', 'kg',  TRUE),
    ('Gramo',     'g',   TRUE),
    ('Litro',     'L',   TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- categorias (RF-05)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id_categoria   SERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL UNIQUE CHECK (btrim(nombre) <> ''),
    descripcion    TEXT,
    estado         BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE categorias IS 'Categorías del catálogo (RF-05)';

DROP TRIGGER IF EXISTS trg_categorias_actualizado_en ON categorias;
CREATE TRIGGER trg_categorias_actualizado_en
    BEFORE UPDATE ON categorias
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- productos (RF-05, RF-07, HU-004)
-- Los saldos stock_bodega / stock_almacen NO se editan directamente:
-- solo cambian a través de movimientos_inventario (migración 006 y
-- procedimientos de SCRUM-45). El CHECK >= 0 es la última barrera
-- contra stock negativo en ventas concurrentes (RNF-04).
-- precio_compra es confidencial: la API no debe exponerlo al Vendedor.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
    id_producto          SERIAL PRIMARY KEY,
    id_categoria         INTEGER       NOT NULL REFERENCES categorias(id_categoria) ON DELETE RESTRICT ON UPDATE CASCADE,
    id_unidad            INTEGER       NOT NULL REFERENCES unidades_medida(id_unidad) ON DELETE RESTRICT,
    sku                  VARCHAR(50)   NOT NULL UNIQUE CHECK (btrim(sku) <> ''),
    nombre               VARCHAR(150)  NOT NULL CHECK (btrim(nombre) <> ''),
    descripcion          TEXT,
    imagen_url           VARCHAR(500),
    precio_compra        NUMERIC(12,2) NOT NULL CHECK (precio_compra >= 0),
    precio_venta         NUMERIC(12,2) NOT NULL CHECK (precio_venta >= 0),
    stock_bodega         NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_bodega >= 0),
    stock_almacen        NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_almacen >= 0),
    stock_total          NUMERIC(13,3) GENERATED ALWAYS AS (stock_bodega + stock_almacen) STORED,
    stock_minimo_bodega  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo_bodega >= 0),
    stock_minimo_almacen NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo_almacen >= 0),
    estado               BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE productos IS 'Catálogo de productos con inventario dual Bodega/Almacén - RF-05, RF-07';
COMMENT ON COLUMN productos.sku IS 'Código único del producto (SKU / código de barras) - CU-04 EX-1';
COMMENT ON COLUMN productos.precio_compra IS 'Confidencial: solo visible para Administrador y Propietario/Gerente';
COMMENT ON COLUMN productos.stock_bodega IS 'Existencias en Bodega. Solo cambia por movimientos_inventario';
COMMENT ON COLUMN productos.stock_almacen IS 'Existencias en Almacén (mostrador). Solo cambia por movimientos_inventario';
COMMENT ON COLUMN productos.stock_total IS 'Bodega + Almacén. Se valida contra él en ventas y pedidos (RN-01)';

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(id_categoria);
CREATE INDEX IF NOT EXISTS idx_productos_estado ON productos(estado);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(lower(nombre));

DROP TRIGGER IF EXISTS trg_productos_actualizado_en ON productos;
CREATE TRIGGER trg_productos_actualizado_en
    BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

COMMIT;
