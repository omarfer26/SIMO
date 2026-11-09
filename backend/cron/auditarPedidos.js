// backend/cron/auditarPedidos.js
const cron = require('node-cron');
const pool = require('../db');

const iniciarAuditoriaPedidos = () => {
    // Se ejecuta todos los días a la medianoche (00:00)
    cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] Iniciando auditoría de pedidos de medianoche...');
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Actualiza a 'vencido' los pedidos pendientes cuya fecha límite ya pasó
            // y retorna los IDs para generar la alerta consolidada
            const queryActualizar = `
                UPDATE pedidos 
                SET estado = 'vencido' 
                WHERE estado = 'pendiente' 
                AND fecha_vencimiento < CURRENT_DATE
                RETURNING id_pedido, id_usuario;
            `;

            const { rows: pedidosVencidos } = await client.query(queryActualizar);

            await client.query('COMMIT');

            // Disparar alertas consolidadas si se encontraron vencimientos
            if (pedidosVencidos.length > 0) {
                console.log(`[Alerta Consolidada] Se auditaron y marcaron ${pedidosVencidos.length} pedidos como vencidos.`);
                // Aquí podrías integrar un envío de correo (Nodemailer) a los administradores
                // o insertar un registro en una tabla de 'notificaciones'.
            } else {
                console.log('[Cron] Auditoría finalizada: No se encontraron pedidos vencidos de ayer.');
            }

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[Cron Error] Falla al auditar los pedidos a medianoche:', error);
        } finally {
            client.release();
        }
    });
};

module.exports = iniciarAuditoriaPedidos;