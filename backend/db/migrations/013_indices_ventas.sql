-- =====================================================================
-- SIMO - Migración 013: índices B-tree para consultas de ventas (SCRUM-133)
-- Requisitos: RNF-01 (rendimiento) | RF-16, RF-21 (historial y dashboard)
--
-- Medido con EXPLAIN ANALYZE sobre 50.000 ventas y 150.000 líneas generadas
-- con db/carga/poblar_masivo.sql (SCRUM-131). Resultados en db/README.md.
--
-- 1. idx_ventas_fecha (fecha_venta) INCLUDE (total, estado)
--    El historial y "últimas ventas" filtran u ordenan por fecha SIN filtrar
--    por estado (muestran también las anuladas): el índice parcial de 005 no
--    les sirve y hacían Seq Scan de toda la tabla.
-- 2. idx_ventas_fecha_completadas (fecha_venta) INCLUDE (total) WHERE COMPLETADA
--    Se rehace como índice de cobertura: el dashboard suma totales por día
--    con un Index Only Scan, sin leer la tabla.
-- 3. uq_detalles_ventas_producto (id_venta, id_producto) INCLUDE (cantidad, subtotal_linea)
--    La restricción UNIQUE ya indexa id_venta; con INCLUDE el reporte de
--    productos más vendidos une ventas y líneas por índice en vez de leer
--    las 150.000 líneas completas.
-- 4. idx_detalles_ventas_producto (id_producto, id_venta) INCLUDE (cantidad, precio_unitario)
--    Reemplaza idx_detalles_ventas_id_producto (005): historial y unidades
--    vendidas de un producto salen del índice sin visitar la tabla.
-- 5. random_page_cost = 1.1 para la base (valor recomendado para SSD; Neon y
--    Docker local usan SSD). Con el valor por defecto (4, pensado para discos
--    mecánicos) el planificador prefería leer completas las líneas de venta en
--    el reporte de productos más vendidos del mes aunque el índice 3 es más
--    rápido (14 ms -> 4,5 ms medido). Aplica a las conexiones nuevas.
--
-- Re-ejecutable: cada índice se crea solo si no existe con esa definición.
-- =====================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (fecha_venta) INCLUDE (total, estado);
COMMENT ON INDEX idx_ventas_fecha IS 'Historial y últimas ventas por fecha, todas las ventas (SCRUM-133)';

DROP INDEX IF EXISTS idx_ventas_fecha_completadas;
CREATE INDEX idx_ventas_fecha_completadas ON ventas (fecha_venta) INCLUDE (total) WHERE estado = 'COMPLETADA';
COMMENT ON INDEX idx_ventas_fecha_completadas IS 'Ventas completadas por fecha con total, para el dashboard (SCRUM-133)';

DO $$
BEGIN
    -- Solo si la restricción aún no tiene las columnas incluidas
    IF NOT EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = 'uq_detalles_ventas_producto' AND i.indnatts > i.indnkeyatts
    ) THEN
        ALTER TABLE detalles_ventas DROP CONSTRAINT IF EXISTS uq_detalles_ventas_producto;
        ALTER TABLE detalles_ventas ADD CONSTRAINT uq_detalles_ventas_producto
            UNIQUE (id_venta, id_producto) INCLUDE (cantidad, subtotal_linea);
    END IF;
END
$$;

DROP INDEX IF EXISTS idx_detalles_ventas_id_producto;
CREATE INDEX IF NOT EXISTS idx_detalles_ventas_producto
    ON detalles_ventas (id_producto, id_venta) INCLUDE (cantidad, precio_unitario);
COMMENT ON INDEX idx_detalles_ventas_producto IS 'Ventas de un producto sin visitar la tabla (SCRUM-133)';

DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET random_page_cost = 1.1', current_database());
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin permiso para ajustar random_page_cost en %; pídalo al dueño de la base', current_database();
END
$$;

COMMIT;

ANALYZE ventas;
ANALYZE detalles_ventas;
