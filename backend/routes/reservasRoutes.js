// backend/routes/reservasRoutes.js
const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/reservations - Crear una reserva de 15 minutos
router.post('/', verificarToken, async (req, res, next) => {
    const { productos } = req.body; // [{ id_producto: 1, cantidad: 2 }]
    const id_usuario = req.usuario.id_usuario;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Validar y descontar stock temporalmente (similar a las ventas)
        for (const item of productos) {
            const prodRes = await client.query('SELECT stock FROM productos WHERE id_producto = $1 FOR UPDATE', [item.id_producto]);
            if (prodRes.rowCount === 0 || prodRes.rows[0].stock < item.cantidad) {
                throw new Error(`Stock insuficiente para el producto ID ${item.id_producto}`);
            }
            await client.query('UPDATE productos SET stock = stock - $1 WHERE id_producto = $2', [item.cantidad, item.id_producto]);
        }

        // 2. Crear la cabecera de la reserva (PostgreSQL calculará los 15 minutos automáticamente)
        const resInsert = await client.query(
            "INSERT INTO reservas_stock (id_usuario) VALUES ($1) RETURNING id_reserva, fecha_expiracion",
            [id_usuario]
        );
        const id_reserva = resInsert.rows[0].id_reserva;

        // 3. Insertar los detalles
        for (const item of productos) {
            await client.query(
                "INSERT INTO detalles_reserva (id_reserva, id_producto, cantidad) VALUES ($1, $2, $3)",
                [id_reserva, item.id_producto, item.cantidad]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: "Stock reservado por 15 minutos.",
            reserva: resInsert.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        error.statusCode = 400; // Pasarlo a tu manejador de errores centralizado
        next(error);
    } finally {
        client.release();
    }
});

module.exports = router;