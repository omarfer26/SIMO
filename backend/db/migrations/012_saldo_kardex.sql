-- =====================================================================
-- SIMO - Migración 012: cálculo y validación del saldo del Kardex (SCRUM-132)
-- Funciones: fn_kardex_producto, fn_validar_kardex
-- Requisitos: RF-11 | CU-08 | RNF-04
--
-- fn_kardex_producto(producto, desde, hasta)
--   Recorre los movimientos del producto en orden cronológico y recalcula,
--   uno a uno, el saldo de Bodega y de Almacén y el costo promedio ponderado
--   (método de valorización del Kardex). Marca cada movimiento cuyo saldo
--   guardado no coincide con el recalculado. El rango de fechas solo filtra
--   lo que se muestra: los saldos siempre se calculan desde el primer
--   movimiento, para que el saldo inicial del período sea correcto.
--
-- fn_validar_kardex(producto opcional)
--   Audita uno o todos los productos: compara el saldo final recalculado con
--   el stock actual del producto y cuenta los movimientos inconsistentes.
--
-- Costo promedio ponderado:
--   * Entradas desde fuera (compra, ajuste positivo, reversos):
--       nuevo_promedio = (saldo_total * promedio + cantidad * costo) / (saldo_total + cantidad)
--   * Salidas y traslados internos no cambian el promedio.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_kardex_producto(
    p_id_producto INTEGER,
    p_desde       TIMESTAMPTZ DEFAULT NULL,
    p_hasta       TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id_movimiento       BIGINT,
    fecha_movimiento    TIMESTAMPTZ,
    tipo_movimiento     VARCHAR,
    entrada_bodega      NUMERIC,
    salida_bodega       NUMERIC,
    entrada_almacen     NUMERIC,
    salida_almacen      NUMERIC,
    saldo_bodega        NUMERIC,
    saldo_almacen       NUMERIC,
    saldo_total         NUMERIC,
    costo_unitario      NUMERIC,
    costo_promedio      NUMERIC,
    saldo_valorizado    NUMERIC,
    saldo_coincide      BOOLEAN,
    id_usuario          INTEGER,
    documento_referencia VARCHAR,
    motivo              TEXT
) AS $$
DECLARE
    m          RECORD;
    v_bodega   NUMERIC := 0;
    v_almacen  NUMERIC := 0;
    v_promedio NUMERIC := 0;
    v_total    NUMERIC;
    v_entrada  BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM productos p WHERE p.id_producto = p_id_producto) THEN
        RAISE EXCEPTION 'El producto % no existe', p_id_producto USING ERRCODE = 'SM001';
    END IF;

    FOR m IN
        SELECT mi.* FROM movimientos_inventario mi
        WHERE mi.id_producto = p_id_producto
        ORDER BY mi.fecha_movimiento, mi.id_movimiento
    LOOP
        v_total := v_bodega + v_almacen;
        -- Entra mercancía desde fuera de la empresa: recalcula el costo promedio
        v_entrada := m.ubicacion_origen IS NULL AND m.ubicacion_destino IS NOT NULL;
        IF v_entrada THEN
            v_promedio := CASE
                WHEN v_total + m.cantidad > 0
                    THEN round((v_total * v_promedio + m.cantidad * m.costo_unitario) / (v_total + m.cantidad), 4)
                ELSE m.costo_unitario
            END;
        END IF;

        v_bodega := v_bodega
            + CASE WHEN m.ubicacion_destino = 'BODEGA' THEN m.cantidad ELSE 0 END
            - CASE WHEN m.ubicacion_origen  = 'BODEGA' THEN m.cantidad ELSE 0 END;
        v_almacen := v_almacen
            + CASE WHEN m.ubicacion_destino = 'ALMACEN' THEN m.cantidad ELSE 0 END
            - CASE WHEN m.ubicacion_origen  = 'ALMACEN' THEN m.cantidad ELSE 0 END;

        IF (p_desde IS NULL OR m.fecha_movimiento >= p_desde)
           AND (p_hasta IS NULL OR m.fecha_movimiento <= p_hasta) THEN
            id_movimiento        := m.id_movimiento;
            fecha_movimiento     := m.fecha_movimiento;
            tipo_movimiento      := m.tipo_movimiento;
            entrada_bodega       := CASE WHEN m.ubicacion_destino = 'BODEGA'  THEN m.cantidad ELSE 0 END;
            salida_bodega        := CASE WHEN m.ubicacion_origen  = 'BODEGA'  THEN m.cantidad ELSE 0 END;
            entrada_almacen      := CASE WHEN m.ubicacion_destino = 'ALMACEN' THEN m.cantidad ELSE 0 END;
            salida_almacen       := CASE WHEN m.ubicacion_origen  = 'ALMACEN' THEN m.cantidad ELSE 0 END;
            saldo_bodega         := v_bodega;
            saldo_almacen        := v_almacen;
            saldo_total          := v_bodega + v_almacen;
            costo_unitario       := m.costo_unitario;
            costo_promedio       := round(v_promedio, 2);
            saldo_valorizado     := round((v_bodega + v_almacen) * v_promedio, 2);
            saldo_coincide       := (m.saldo_bodega = v_bodega AND m.saldo_almacen = v_almacen);
            id_usuario           := m.id_usuario;
            documento_referencia := m.documento_referencia;
            motivo               := m.motivo;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_kardex_producto(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) IS
    'Kardex de un producto con saldos recalculados por ubicación y costo promedio ponderado (SCRUM-132, RF-11)';

CREATE OR REPLACE FUNCTION fn_validar_kardex(p_id_producto INTEGER DEFAULT NULL)
RETURNS TABLE (
    id_producto              INTEGER,
    sku                      VARCHAR,
    movimientos              INTEGER,
    movimientos_inconsistentes INTEGER,
    saldo_bodega_kardex      NUMERIC,
    saldo_almacen_kardex     NUMERIC,
    stock_bodega             NUMERIC,
    stock_almacen            NUMERIC,
    valor_inventario         NUMERIC,
    consistente              BOOLEAN
) AS $$
    SELECT p.id_producto,
           p.sku,
           coalesce(k.movimientos, 0)::INTEGER,
           coalesce(k.inconsistentes, 0)::INTEGER,
           coalesce(k.saldo_bodega, 0),
           coalesce(k.saldo_almacen, 0),
           p.stock_bodega,
           p.stock_almacen,
           coalesce(k.valor, 0),
           coalesce(k.inconsistentes, 0) = 0
               AND coalesce(k.saldo_bodega, 0) = p.stock_bodega
               AND coalesce(k.saldo_almacen, 0) = p.stock_almacen
    FROM productos p
    LEFT JOIN LATERAL (
        SELECT count(*) AS movimientos,
               count(*) FILTER (WHERE NOT f.saldo_coincide) AS inconsistentes,
               (array_agg(f.saldo_bodega ORDER BY f.fecha_movimiento DESC, f.id_movimiento DESC))[1] AS saldo_bodega,
               (array_agg(f.saldo_almacen ORDER BY f.fecha_movimiento DESC, f.id_movimiento DESC))[1] AS saldo_almacen,
               (array_agg(f.saldo_valorizado ORDER BY f.fecha_movimiento DESC, f.id_movimiento DESC))[1] AS valor
        FROM fn_kardex_producto(p.id_producto) f
    ) k ON TRUE
    WHERE p_id_producto IS NULL OR p.id_producto = p_id_producto
    ORDER BY p.id_producto;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION fn_validar_kardex(INTEGER) IS
    'Audita el Kardex: compara el saldo recalculado con el stock de cada producto (SCRUM-132)';

COMMIT;
