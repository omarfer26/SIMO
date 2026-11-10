// src/routes/auditoria.routes.js
// Log de auditoría inalterable (HU-15, RF-24). Montado en /api/audit.
// Solo lectura: la base bloquea UPDATE, DELETE y TRUNCATE sobre log_auditoria
// (migración 007). Contrato del frontend: simoapp/lib/auditoria/auditoriaService.ts
//
// Quién escribe el log: las funciones de la base, dentro de la misma
// transacción de la operación (no puede existir la operación sin su registro):
//   AJUSTE_INVENTARIO   fn_registrar_ajuste (014)
//   CANCELACION_PEDIDO  fn_cambiar_estado_pedido (018)
//   ANULACION_VENTA     fn_anular_venta (020)
//   CAMBIO_PRECIO       trigger de productos (023)
const express = require('express');
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');
const { aInstante } = require('../utils/fechas');

const router = express.Router();

const ACCIONES = ['AJUSTE_INVENTARIO', 'ANULACION_VENTA', 'CANCELACION_PEDIDO', 'CAMBIO_PRECIO',
    'CAMBIO_ROL_USUARIO', 'CAMBIO_ESTADO_USUARIO', 'ACTUALIZACION_EMPRESA'];
const LIMITE_MAXIMO = 2000;

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

// GET /api/audit?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&accion=&entidad=&limite=
router.get('/', verificarToken, verificarRol('ADMIN', 'GERENTE'), async (req, res) => {
    try {
        const desde = aInstante(req.query.desde, false);
        const hasta = aInstante(req.query.hasta, true);
        if (desde === undefined || hasta === undefined) {
            return badRequest(res, 'Los filtros desde y hasta deben tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        if (desde && hasta && desde > hasta) return badRequest(res, 'La fecha desde no puede ser posterior a hasta.');

        const condiciones = [];
        const valores = [];
        const agregar = (sql, valor) => { valores.push(valor); condiciones.push(sql.replace('?', `$${valores.length}`)); };
        if (desde) agregar('l.fecha >= ?', desde);
        if (hasta) agregar('l.fecha <= ?', hasta);
        if (req.query.accion !== undefined) {
            const accion = String(req.query.accion).trim().toUpperCase();
            if (!ACCIONES.includes(accion)) return badRequest(res, `La accion debe ser una de: ${ACCIONES.join(', ')}.`);
            agregar('l.accion = ?', accion);
        }
        if (req.query.entidad !== undefined) agregar('l.entidad = ?', String(req.query.entidad).trim().toLowerCase());
        let limite = LIMITE_MAXIMO;
        if (req.query.limite !== undefined) {
            if (!/^[1-9]\d*$/.test(String(req.query.limite))) return badRequest(res, 'El limite debe ser un entero positivo.');
            limite = Math.min(Number(req.query.limite), LIMITE_MAXIMO);
        }
        valores.push(limite);

        const { rows } = await pool.query(
            `SELECT l.id_log, l.fecha, l.id_usuario, u.nombre_completo AS nombre_usuario,
                    l.id_usuario_autorizador, a.nombre_completo AS nombre_autorizador,
                    l.accion, l.entidad, l.id_entidad, l.justificacion,
                    l.datos_anteriores, l.datos_nuevos, host(l.direccion_ip) AS direccion_ip
             FROM log_auditoria l
             JOIN usuarios u ON u.id_usuario = l.id_usuario
             LEFT JOIN usuarios a ON a.id_usuario = l.id_usuario_autorizador
             ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
             ORDER BY l.fecha DESC, l.id_log DESC
             LIMIT $${valores.length}`,
            valores
        );
        return res.status(200).json({ data: rows });
    } catch (error) {
        console.error('[GET /api/audit] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar la auditoría.' });
    }
});

module.exports = router;
