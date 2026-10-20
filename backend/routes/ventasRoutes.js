const express = require('express');
const pool = require('../db');
const { verificarToken, verificarRol } = require('../middleware/authMiddleware');

const router = express.Router();

// TASA DE IMPUESTO (Ejemplo: 19% IVA)
const TASA_IMPUESTO = 0.19;

// =====================================================================
// POST /api/sales - Procesar venta (Accesible para ADMIN y VENDEDOR)
// =====================================================================
router.post('/', verificarToken, verificarRol(1, 4), async (req, res, next) => {
    const { productos } = req.body;
    const id_usuario = req.usuario.id_usuario;

    if (!productos || productos.length === 0) {
        const error = new Error("La venta debe incluir al menos un producto.");
        error.statusCode = 400;
        return next(error);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let totalVenta = 0;
        let subtotalVenta = 0;
        let totalImpuestos = 0;
        const detallesVenta = [];

        // 1. Validar stock en vivo y calcular totales
        for (const item of productos) {
            const productoRes = await client.query(
                'SELECT nombre, precio, stock FROM productos WHERE id_producto = $1 FOR UPDATE',
                [item.id_producto]
            );

            if (productoRes.rowCount === 0) {
                const error = new Error(`El producto con ID ${item.id_producto} no existe.`);
                error.statusCode = 404;
                throw error;
            }

            const producto = productoRes.rows[0];

            if (producto.stock < item.cantidad) {
                const error = new Error(`Stock insuficiente para el producto: ${producto.nombre}. Stock actual: ${producto.stock}`);
                error.statusCode = 400;
                throw error;
            }

            const subtotalItem = producto.precio * item.cantidad;
            const impuestoItem = subtotalItem * TASA_IMPUESTO;
            const totalItem = subtotalItem + impuestoItem;

            subtotalVenta += subtotalItem;
            totalImpuestos += impuestoItem;
            totalVenta += totalItem;

            detallesVenta.push({
                id_producto: item.id_producto,
                cantidad: item.cantidad,
                precio_unitario: producto.precio,
                subtotal: subtotalItem,
                impuesto: impuestoItem,
                total: totalItem
            });
        }

        // 2. Registrar la venta principal
        const insertVentaQuery = `
            INSERT INTO ventas (id_usuario, subtotal, impuestos, total) 
            VALUES ($1, $2, $3, $4) RETURNING id_venta;
        `;
        const ventaRes = await client.query(insertVentaQuery, [id_usuario, subtotalVenta, totalImpuestos, totalVenta]);
        const id_venta = ventaRes.rows[0].id_venta;

        // 3. Registrar detalles y descontar stock
        for (const detalle of detallesVenta) {
            await client.query(`
                INSERT INTO detalles_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal, impuesto, total) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [id_venta, detalle.id_producto, detalle.cantidad, detalle.precio_unitario, detalle.subtotal, detalle.impuesto, detalle.total]);

            await client.query(`
                UPDATE productos SET stock = stock - $1 WHERE id_producto = $2
            `, [detalle.cantidad, detalle.id_producto]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: "success",
            message: "Venta procesada exitosamente",
            venta: {
                id_venta,
                subtotal: subtotalVenta,
                impuestos: totalImpuestos,
                total: totalVenta,
                detalles: detallesVenta
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

// =====================================================================
// GET /api/sales/daily-summary - Resumen diario para arqueo de caja
// =====================================================================
router.get('/daily-summary', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        const query = `
            SELECT 
                metodo_pago, 
                COUNT(id_venta) as cantidad_transacciones, 
                SUM(total) as total_ingresos 
            FROM ventas 
            WHERE DATE(fecha_venta) = CURRENT_DATE AND estado != 'anulada'
            GROUP BY metodo_pago
            ORDER BY total_ingresos DESC;
        `;

        const { rows } = await pool.query(query);
        const granTotal = rows.reduce((acc, row) => acc + parseFloat(row.total_ingresos), 0);

        res.status(200).json({
            status: "success",
            mensaje: "Resumen diario generado exitosamente",
            fecha: new Date().toISOString().split('T')[0],
            resumen: rows,
            gran_total: granTotal
        });

    } catch (error) {
        next(error);
    }
});

// =====================================================================
// PUT /api/sales/:id/cancel - Anular venta y revertir stock (SCRUM-97)
// =====================================================================
router.put('/:id/cancel', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    const id_venta = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar que la venta exista, no esté anulada y bloquear la fila
        const ventaRes = await client.query('SELECT estado FROM ventas WHERE id_venta = $1 FOR UPDATE', [id_venta]);

        if (ventaRes.rowCount === 0) {
            const error = new Error(`La venta con ID ${id_venta} no existe.`);
            error.statusCode = 404;
            throw error;
        }

        if (ventaRes.rows[0].estado === 'anulada') {
            const error = new Error('Esta venta ya se encuentra anulada previamente.');
            error.statusCode = 400;
            throw error;
        }

        // 2. Extraer los productos y cantidades exactas
        const detallesQuery = 'SELECT id_producto, cantidad FROM detalles_venta WHERE id_venta = $1';
        const detallesRes = await client.query(detallesQuery, [id_venta]);

        // 3. Devolver el stock iterando sobre los detalles
        for (const item of detallesRes.rows) {
            await client.query(
                'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
                [item.cantidad, item.id_producto]
            );
        }

        // 4. Marcar la venta como anulada
        await client.query("UPDATE ventas SET estado = 'anulada' WHERE id_venta = $1", [id_venta]);

        await client.query('COMMIT');

        res.status(200).json({
            status: "success",
            message: `La venta #${id_venta} ha sido anulada exitosamente y el stock fue restaurado.`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

module.exports = router;