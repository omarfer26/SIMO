// backend/cron/auditarKardex.js
// SCRUM-169: auditoría nocturna del Kardex. Todos los días a las 00:30 (hora de
// Colombia) ejecuta sp_auditar_kardex (migración 025): revisa el saldo de cada
// producto contra su stock y cada movimiento contra su documento. Si encuentra
// diferencias deja una alerta en el registro del servidor con el detalle; el
// Gerente puede verlas en GET /api/inventory/kardex-audit.
const cron = require('node-cron');
const { auditarKardex } = require('../src/repositories/inventario.repository');

async function ejecutarAuditoriaKardex() {
    const { resumen, productos_inconsistentes: productos, documentos } = await auditarKardex();
    if (resumen.consistente) {
        console.log(`[Cron] Kardex consistente: ${resumen.productos_revisados} productos y ${resumen.movimientos_revisados} movimientos revisados.`);
        return resumen;
    }
    console.warn(
        `[Alerta Kardex] ${resumen.productos_inconsistentes} producto(s) con saldo descuadrado y `
        + `${resumen.documentos_inconsistentes} documento(s) que no corresponden a sus movimientos. `
        + `Productos: ${productos.slice(0, 20).map((p) => p.sku).join(', ') || '-'}. `
        + `Documentos: ${documentos.slice(0, 20).map((d) => `${d.documento} ${d.id_documento}`).join(', ') || '-'}.`
    );
    return resumen;
}

const iniciarAuditoriaKardex = () => {
    cron.schedule('30 0 * * *', () => {
        ejecutarAuditoriaKardex().catch((error) => {
            console.error('[Cron Error] Falla en la auditoría nocturna del Kardex:', error);
        });
    }, { timezone: 'America/Bogota' });
};

module.exports = iniciarAuditoriaKardex;
module.exports.ejecutarAuditoriaKardex = ejecutarAuditoriaKardex;
