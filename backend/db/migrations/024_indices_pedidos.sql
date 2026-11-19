-- =====================================================================
-- SIMO - Migración 024: auditoría de índices del esquema completo (SCRUM-168)
-- Requisitos: RNF-01 (búsquedas y reportes en menos de 1 segundo)
--
-- La 013 (SCRUM-133) cubrió las ventas. Con el esquema completo del Sprint 3
-- se midieron los endpoints reales de la API sobre 50.000 ventas, 150.000
-- líneas, 155.000 movimientos, 25.000 pagos digitales, 20.000 pedidos y 5.000
-- clientes (db/carga/poblar_masivo.sql). Resultados en backend/db/README.md.
--
-- Columnas clave de la historia, ya indexadas:
--   productos.sku    productos_sku_key (UNIQUE, 003)
--   ventas.fecha     idx_ventas_fecha, idx_ventas_fecha_completadas (013)
--   pedidos.estado   idx_pedidos_estado (004)
--
-- Única consulta frecuente que recorría la tabla completa y crece con el
-- tiempo: pedidos por fecha de solicitud (GET /api/orders con desde/hasta,
-- pantalla /pedidos y reporte "Pedidos de clientes"). Se agrega el índice en
-- el mismo orden de la consulta (más recientes primero), así PostgreSQL lee
-- solo el rango pedido y ya ordenado.
--
-- Llaves foráneas sin índice que se dejan así a propósito: apuntan a tablas
-- de catálogo (usuarios, métodos de pago, unidades, proveedores) cuyas filas
-- nunca se borran (se inactivan), así que el índice solo encarecería cada
-- inserción en el Kardex, ventas y pedidos. Ver SCRUM-174.
-- =====================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_solicitud
    ON pedidos (fecha_solicitud DESC, id_pedido DESC);
COMMENT ON INDEX idx_pedidos_fecha_solicitud IS
    'Pedidos por fecha de solicitud, más recientes primero: filtro desde/hasta y reporte de pedidos (SCRUM-168)';

COMMIT;

ANALYZE pedidos;
