// backend/cron/limpiarReservas.js
const cron = require('node-cron');
const pool = require('../db');

// Esta tarea se ejecuta cada minuto ('* * * * *')
const iniciarLimpiezaDeReservas = () => {
    cron.schedule('* * * * *', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Buscar reservas que estén 'pendientes' y cuya fecha_expiracion ya pasó
            const queryReservasVencidas = `
                SELECT id_reserva FROM reservas_stock 
                WHERE estado = 'pendiente' AND fecha_expiracion <= CURRENT_TIMESTAMP
            `;
            const { rows: reservasVencidas } = await client.query(queryReservasVencidas);

            if (reservasVencidas.length > 0) {
                const idsVencidos = reservasVencidas.map(r => r.id_reserva);

                // 2. Devolver el stock a la tabla de productos sumando las cantidades reservadas
                const queryRestaurarStock = `
                    UPDATE productos p
                    SET stock = p.stock + dr.cantidad
                    FROM detalles_reserva dr
                    WHERE p.id_producto = dr.id_producto 
                    AND dr.id_reserva = ANY($1)
                `;
                await client.query(queryRestaurarStock, [idsVencidos]);

                // 3. Marcar las reservas como 'expiradas' para no volver a procesarlas
                const queryActualizarEstado = `
                    UPDATE reservas_stock 
                    SET estado = 'expirada' 
                    WHERE id_reserva = ANY($1)
                `;
                await client.query(queryActualizarEstado, [idsVencidos]);

                console.log(`[Cron] Se han liberado ${idsVencidos.length} reservas expiradas y el stock fue restaurado.`);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[Cron Error] Falla al limpiar las reservas expiradas:', error);
        } finally {
            client.release();
        }
    });
};

module.exports = iniciarLimpiezaDeReservas;