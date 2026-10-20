-- SIMO - Consultas de referencia para medir índices de ventas (SCRUM-133)
-- Ejecutar sobre una base poblada con db/carga/poblar_masivo.sql:
--   psql -d simo_carga -f db/carga/consultas_rendimiento.sql

\pset pager off

-- Q1 ventas del último mes (listado del historial, todas)
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, TIMING OFF) SELECT id_venta, fecha_venta, total, estado FROM ventas WHERE fecha_venta >= now() - interval '30 days' ORDER BY fecha_venta DESC;
-- Q2 total vendido por día, última semana (dashboard)
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, TIMING OFF) SELECT date_trunc('day', fecha_venta) d, count(*), sum(total) FROM ventas WHERE estado='COMPLETADA' AND fecha_venta >= now() - interval '7 days' GROUP BY 1;
-- Q3 productos más vendidos del mes
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, TIMING OFF) SELECT d.id_producto, sum(d.cantidad), sum(d.subtotal_linea) FROM ventas v JOIN detalles_ventas d USING (id_venta) WHERE v.estado='COMPLETADA' AND v.fecha_venta >= now() - interval '30 days' GROUP BY 1 ORDER BY 3 DESC LIMIT 10;
-- Q4 historial de ventas de un producto
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, TIMING OFF) SELECT v.fecha_venta, d.cantidad, d.precio_unitario FROM detalles_ventas d JOIN ventas v USING (id_venta) WHERE d.id_producto = (SELECT id_producto FROM productos WHERE sku='CARGA-000777') ORDER BY v.fecha_venta DESC;
-- Q5 unidades vendidas de un producto en el trimestre
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, TIMING OFF) SELECT sum(d.cantidad) FROM detalles_ventas d JOIN ventas v USING (id_venta) WHERE d.id_producto = (SELECT id_producto FROM productos WHERE sku='CARGA-000777') AND v.fecha_venta >= now() - interval '90 days';
-- Q6 últimas 20 ventas (pantalla principal)
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, TIMING OFF) SELECT id_venta, fecha_venta, total FROM ventas ORDER BY fecha_venta DESC LIMIT 20;
