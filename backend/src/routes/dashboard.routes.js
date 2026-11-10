// src/routes/dashboard.routes.js
// Dashboard gerencial y alertas (HU-13, HU-14). Montado en /api/dashboard.
// SCRUM-67 y SCRUM-68 (Sebastián), ajustados al esquema real: el stock es
// dual (stock_bodega / stock_almacen), las ventas usan los estados
// COMPLETADA / ANULADA y las líneas están en detalles_ventas.
const express = require('express');
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');
const { pedidosVencidos } = require('../repositories/pedidos.repository');

const router = express.Router();

// GET /api/dashboard/metrics - Métricas del panel principal (SCRUM-67)
router.get('/metrics', verificarToken, verificarRol('ADMIN', 'GERENTE'), async (req, res) => {
    try {
        const [ventas, stock, rotacion, operacion] = await Promise.all([
            // Ventas del mes en curso (sin anuladas) y del día
            pool.query(`
                SELECT coalesce(sum(total) FILTER (WHERE fecha_venta >= date_trunc('month', now())), 0)::float AS ventas_mes,
                       count(*) FILTER (WHERE fecha_venta >= date_trunc('month', now()))::int AS transacciones_mes,
                       coalesce(sum(total) FILTER (WHERE fecha_venta >= date_trunc('day', now())), 0)::float AS ventas_hoy,
                       count(*) FILTER (WHERE fecha_venta >= date_trunc('day', now()))::int AS transacciones_hoy
                FROM ventas
                WHERE estado = 'COMPLETADA' AND fecha_venta >= date_trunc('month', now()) - interval '1 day'`),
            // Capital invertido en inventario: existencias por su precio de compra
            pool.query(`
                SELECT coalesce(sum(stock_total * precio_compra), 0)::float AS valor_inventario,
                       coalesce(sum(stock_bodega * precio_compra), 0)::float AS valor_bodega,
                       coalesce(sum(stock_almacen * precio_compra), 0)::float AS valor_almacen,
                       count(*)::int AS productos_activos
                FROM productos WHERE estado`),
            // Productos más vendidos (ventas completadas)
            pool.query(`
                SELECT p.id_producto, p.sku, p.nombre, sum(d.cantidad)::float AS total_vendido,
                       sum(d.subtotal_linea)::float AS total_ingresos
                FROM detalles_ventas d
                JOIN ventas v ON v.id_venta = d.id_venta
                JOIN productos p ON p.id_producto = d.id_producto
                WHERE v.estado = 'COMPLETADA'
                GROUP BY p.id_producto, p.sku, p.nombre
                ORDER BY total_vendido DESC
                LIMIT 5`),
            pool.query(`
                SELECT (SELECT count(*)::int FROM pedidos WHERE estado NOT IN ('ENTREGADO', 'CANCELADO')) AS pedidos_abiertos,
                       (SELECT count(*)::int FROM pedidos
                        WHERE estado NOT IN ('ENTREGADO', 'CANCELADO') AND fecha_entrega_pactada < now()) AS pedidos_vencidos,
                       (SELECT count(*)::int FROM pagos_digitales pd JOIN ventas v ON v.id_venta = pd.id_venta
                        WHERE pd.estado = 'PENDIENTE' AND v.estado = 'COMPLETADA') AS pagos_por_conciliar`),
        ]);

        return res.status(200).json({
            status: 'success',
            data: {
                ventas_totales: ventas.rows[0].ventas_mes,
                transacciones_mes: ventas.rows[0].transacciones_mes,
                ventas_hoy: ventas.rows[0].ventas_hoy,
                transacciones_hoy: ventas.rows[0].transacciones_hoy,
                valor_monetario_stock: stock.rows[0].valor_inventario,
                valor_stock_bodega: stock.rows[0].valor_bodega,
                valor_stock_almacen: stock.rows[0].valor_almacen,
                productos_activos: stock.rows[0].productos_activos,
                rotacion_productos: rotacion.rows,
                ...operacion.rows[0],
            },
        });
    } catch (error) {
        console.error('[GET /api/dashboard/metrics] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al calcular las métricas.' });
    }
});

// GET /api/dashboard/alerts - Alertas duales de stock (SCRUM-68, HU-14)
//   SURTIR:  el Almacén está en su mínimo o por debajo y Bodega tiene con qué surtirlo
//   COMPRAR: Bodega está en su mínimo o por debajo (hay que pedir al proveedor)
// Un producto puede tener las dos. Gerente y Administrador reciben además los
// pedidos vencidos (SCRUM-69).
router.get('/alerts', verificarToken, verificarRol('ADMIN', 'GERENTE', 'INVENTARIO'), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.id_producto, p.sku, p.nombre, u.abreviatura AS unidad,
                   p.stock_bodega, p.stock_almacen, p.stock_total,
                   p.stock_minimo_bodega, p.stock_minimo_almacen,
                   (p.stock_almacen <= p.stock_minimo_almacen AND p.stock_bodega > 0) AS surtir,
                   (p.stock_bodega <= p.stock_minimo_bodega) AS comprar,
                   (p.stock_total = 0) AS agotado
            FROM productos p
            JOIN unidades_medida u ON u.id_unidad = p.id_unidad
            WHERE p.estado
              AND (p.stock_bodega <= p.stock_minimo_bodega OR p.stock_almacen <= p.stock_minimo_almacen)
            ORDER BY p.stock_total ASC, p.nombre`);

        const productos = rows.map(({ surtir, comprar, ...producto }) => ({
            ...producto,
            alertas: [...(surtir ? ['SURTIR'] : []), ...(comprar ? ['COMPRAR'] : [])],
            // Compatibilidad con la primera versión del endpoint
            stock: producto.stock_total,
            stock_minimo: producto.stock_minimo_bodega,
        }));
        const respuesta = {
            status: 'success',
            mensaje: 'Alertas de inventario recuperadas exitosamente',
            total_alertas: productos.length,
            total_surtir: productos.filter((p) => p.alertas.includes('SURTIR')).length,
            total_comprar: productos.filter((p) => p.alertas.includes('COMPRAR')).length,
            productos_criticos: productos,
        };
        if (req.usuario.rol !== 'INVENTARIO') {
            respuesta.pedidos_vencidos = await pedidosVencidos();
        }
        return res.status(200).json(respuesta);
    } catch (error) {
        console.error('[GET /api/dashboard/alerts] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar las alertas.' });
    }
});

module.exports = router;
