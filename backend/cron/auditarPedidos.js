// backend/cron/auditarPedidos.js
// SCRUM-69: tarea programada de medianoche que audita los pedidos vencidos y
// emite la alerta consolidada.
//
// "Vencido" no es un estado del pedido: el ciclo (RN-04) solo tiene REGISTRADO,
// CONFIRMADO, EN_PREPARACION, LISTO, ENTREGADO y CANCELADO, y la base rechaza
// cualquier otro. Un pedido está vencido cuando sigue abierto y ya pasó su
// fecha de entrega pactada, así que la tarea no modifica nada: consulta los
// vencidos y deja el resumen en el registro del servidor. Las pantallas los
// reciben en GET /api/dashboard/alerts (pedidos_vencidos) y en el campo
// "vencido" de GET /api/orders.
const cron = require('node-cron');
const { pedidosVencidos } = require('../src/repositories/pedidos.repository');

async function auditarPedidosVencidos() {
    const vencidos = await pedidosVencidos();
    if (vencidos.length === 0) {
        console.log('[Cron] Auditoría de pedidos: no hay pedidos vencidos.');
        return vencidos;
    }
    const total = vencidos.reduce((suma, p) => suma + Number(p.total), 0);
    console.warn(
        `[Alerta consolidada] ${vencidos.length} pedido(s) vencido(s) por $${total.toFixed(2)}: `
        + vencidos.map((p) => `#${p.id_pedido} (${p.estado}, ${p.dias_vencido} día(s), ${p.nombre_cliente})`).join('; ')
    );
    return vencidos;
}

const iniciarAuditoriaPedidos = () => {
    // Todos los días a la medianoche, hora de Colombia
    cron.schedule('0 0 * * *', () => {
        auditarPedidosVencidos().catch((error) => {
            console.error('[Cron Error] Falla al auditar los pedidos a medianoche:', error);
        });
    }, { timezone: 'America/Bogota' });
};

module.exports = iniciarAuditoriaPedidos;
module.exports.auditarPedidosVencidos = auditarPedidosVencidos;
