// backend/routes/dashboardRoutes.js
const express = require('express');
const pool = require('../db');
const { verificarToken, verificarRol } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/dashboard/metrics - Métricas optimizadas para el panel principal (SCRUM-67)
router.get('/metrics', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        // 1. Agregación de Ventas Totales (del mes actual, excluyendo anuladas)
        const ventasQuery = `
            SELECT COALESCE(SUM(total), 0) AS ventas_totales_mes
            FROM ventas 
            WHERE estado != 'anulada' 
            AND date_trunc('month', fecha_venta) = date_trunc('month', CURRENT_DATE);
        `;

        // 2. Valor Monetario del Stock (Capital invertido en inventario físico)
        // Se multiplica el stock actual por el precio de compra
        const stockQuery = `
            SELECT COALESCE(SUM(stock * precio_compra), 0) AS valor_inventario
            FROM productos 
            WHERE estado = true;
        `;

        // 3. Rotación de Stock (Productos más vendidos históricamente)
        const rotacionQuery = `
            SELECT p.id_producto, p.nombre, SUM(dv.cantidad) as total_vendido
            FROM detalles_venta dv
            JOIN ventas v ON dv.id_venta = v.id_venta
            JOIN productos p ON dv.id_producto = p.id_producto
            WHERE v.estado != 'anulada'
            GROUP BY p.id_producto, p.nombre
            ORDER BY total_vendido DESC
            LIMIT 5;
        `;

        // Ejecutar las tres consultas en paralelo para máxima optimización y velocidad
        const [ventasRes, stockRes, rotacionRes] = await Promise.all([
            pool.query(ventasQuery),
            pool.query(stockQuery),
            pool.query(rotacionQuery)
        ]);

        res.status(200).json({
            status: "success",
            data: {
                ventas_totales: parseFloat(ventasRes.rows[0].ventas_totales_mes),
                valor_monetario_stock: parseFloat(stockRes.rows[0].valor_inventario),
                rotacion_productos: rotacionRes.rows.map(row => ({
                    ...row,
                    total_vendido: parseInt(row.total_vendido)
                }))
            }
        });

    } catch (error) {
        next(error); // Delegar al manejador global de errores
    }
});

// =====================================================================
// GET /api/dashboard/alerts - Alertas de stock mínimo (SCRUM-68)
// =====================================================================
router.get('/alerts', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        // Consulta en PostgreSQL para filtrado activo de productos por debajo del stock mínimo parametrizado
        const query = `
            SELECT 
                id_producto, 
                nombre, 
                stock, 
                stock_minimo 
            FROM productos 
            WHERE estado = true 
            AND stock <= stock_minimo
            ORDER BY stock ASC;
        `;

        const { rows } = await pool.query(query);

        res.status(200).json({
            status: "success",
            mensaje: "Alertas de inventario recuperadas exitosamente",
            total_alertas: rows.length,
            productos_criticos: rows
        });

    } catch (error) {
        next(error); // Delega la respuesta al manejador centralizado de errores
    }
});

module.exports = router;