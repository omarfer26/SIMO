const express = require('express');
const pool = require('../db');
const { verificarToken, verificarRol } = require('../middleware/authMiddleware');

const router = express.Router();

// TASA DE IMPUESTO (Ejemplo: 19% IVA)
const TASA_IMPUESTO = 0.19;

// POST /api/sales - Procesar venta (Accesible para ADMIN y VENDEDOR)
router.post('/', verificarToken, verificarRol(1, 4), async (req, res) => {
    const { productos } = req.body; // Espera un array: [{ id_producto: 1, cantidad: 2 }, ...]
    const id_usuario = req.usuario.id_usuario; // Extraído del token por el middleware

    if (!productos || productos.length === 0) {
        return res.status(400).json({ error: "Bad Request", message: "La venta debe incluir al menos un producto." });
    }

    // Solicitamos un cliente dedicado del pool para manejar la transacción de forma segura
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Iniciar transacción

        let totalVenta = 0;
        let subtotalVenta = 0;
        let totalImpuestos = 0;
        const detallesVenta = [];

        // 1. Validar stock en vivo (RN-01) y calcular totales
        for (const item of productos) {
            // Se usa FOR UPDATE para bloquear la fila y evitar condiciones de carrera si dos vendedores venden el mismo producto al tiempo
            const productoRes = await client.query(
                'SELECT nombre, precio, stock FROM productos WHERE id_producto = $1 FOR UPDATE',
                [item.id_producto]
            );

            if (productoRes.rowCount === 0) {
                throw new Error(`El producto con ID ${item.id_producto} no existe.`);
            }

            const producto = productoRes.rows[0];

            if (producto.stock < item.cantidad) {
                throw new Error(`Stock insuficiente para el producto: ${producto.nombre}. Stock actual: ${producto.stock}`);
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

        // 2. Registrar la venta principal (Tabla: ventas)
        const insertVentaQuery = `
            INSERT INTO ventas (id_usuario, subtotal, impuestos, total) 
            VALUES ($1, $2, $3, $4) RETURNING id_venta;
        `;
        const ventaRes = await client.query(insertVentaQuery, [id_usuario, subtotalVenta, totalImpuestos, totalVenta]);
        const id_venta = ventaRes.rows[0].id_venta;

        // 3. Registrar los detalles y descontar el stock en PostgreSQL
        for (const detalle of detallesVenta) {
            // Insertar en tabla detalles_venta
            await client.query(`
                INSERT INTO detalles_venta (id_venta, id_producto, cantidad, precio_unitario, subtotal, impuesto, total) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [id_venta, detalle.id_producto, detalle.cantidad, detalle.precio_unitario, detalle.subtotal, detalle.impuesto, detalle.total]);

            // Descontar stock (Tabla: productos)
            await client.query(`
                UPDATE productos SET stock = stock - $1 WHERE id_producto = $2
            `, [detalle.cantidad, detalle.id_producto]);
        }

        await client.query('COMMIT'); // Confirmar transacción

        res.status(201).json({
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
        await client.query('ROLLBACK'); // Revertir todo si hay error (ej. falta de stock)
        console.error('Error al procesar la venta:', error);

        // Determinar si es un error de validación nuestro o un error interno del servidor
        const statusCode = error.message.includes('Stock insuficiente') || error.message.includes('no existe') ? 400 : 500;
        res.status(statusCode).json({ error: "Error procesando la venta", message: error.message });
    } finally {
        client.release(); // Liberar el cliente de vuelta al pool
    }
});

// GET /api/sales/daily-summary - Resumen diario para arqueo de caja
router.get('/daily-summary', verificarToken, verificarRol(1, 2), async (req, res) => {
    try {
        // Consultar ventas solo de la fecha actual y agruparlas por método de pago
        const query = `
            SELECT 
                metodo_pago, 
                COUNT(id_venta) as cantidad_transacciones, 
                SUM(total) as total_ingresos 
            FROM ventas 
            WHERE DATE(fecha_venta) = CURRENT_DATE
            GROUP BY metodo_pago
            ORDER BY total_ingresos DESC;
        `;

        const { rows } = await pool.query(query);

        // Sumar todos los grupos para obtener el gran total del día en caja
        const granTotal = rows.reduce((acc, row) => acc + parseFloat(row.total_ingresos), 0);

        res.status(200).json({
            mensaje: "Resumen diario generado exitosamente",
            fecha: new Date().toISOString().split('T')[0], // Retorna YYYY-MM-DD
            resumen: rows,
            gran_total: granTotal
        });

    } catch (error) {
        console.error('Error al generar arqueo de caja:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Error al generar el resumen diario de ventas."
        });
    }
});

module.exports = router;