// src/routes/pagos.routes.js
// Pagos por billetera virtual y su conciliación manual (SCRUM-78, RF-15).
// Montado en /api/payments. Complementa SCRUM-73 del frontend (referencia y
// comprobante de Nequi, Daviplata y transferencia).
//
// El pago es informativo: no hay integración con el banco. El sistema guarda
// el soporte (referencia y comprobante) y el resultado de la revisión que
// hace el Gerente o el Administrador contra el extracto.
const express = require('express');
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');
const { aInstante } = require('../utils/fechas');

const router = express.Router();
const concilian = verificarRol('GERENTE', 'ADMIN');

const ESTADOS = ['PENDIENTE', 'CONCILIADO', 'RECHAZADO'];
const METODOS = ['NEQUI', 'DAVIPLATA', 'TRANSFERENCIA'];
const TIPOS_COMPROBANTE = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAMANO_MAXIMO = 5 * 1024 * 1024; // el mismo límite del frontend (soportePago.ts)
const REGEX_ID = /^[1-9]\d*$/;

const ERRORES = {
    SM015: [400, 'Bad Request'],
    SM030: [403, 'Forbidden'],
    SM031: [404, 'Not Found'],
    SM032: [409, 'Conflict'],
};

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

const SELECT_PAGO = `
    SELECT pd.id_pago, pd.id_venta, v.fecha_venta, v.id_pedido, mp.codigo AS metodo_pago, mp.nombre AS nombre_metodo_pago,
           v.total, v.estado AS estado_venta, pd.referencia, pd.estado,
           c.nombre AS nombre_cliente, u.nombre_completo AS nombre_vendedor,
           CASE WHEN pd.comprobante_nombre IS NOT NULL THEN
                jsonb_build_object('nombre', pd.comprobante_nombre, 'tipo', pd.comprobante_tipo,
                                   'tamano', octet_length(pd.comprobante_datos), 'subido_en', pd.comprobante_subido_en)
           END AS comprobante,
           pd.conciliado_por, cu.nombre_completo AS nombre_conciliador, pd.conciliado_en, pd.observacion
    FROM pagos_digitales pd
    JOIN ventas v ON v.id_venta = pd.id_venta
    JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
    JOIN usuarios u ON u.id_usuario = v.id_usuario
    LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
    LEFT JOIN usuarios cu ON cu.id_usuario = pd.conciliado_por
`;

// ---------------------------------------------------------------------
// GET /api/payments/wallet?estado=&metodo=&desde=&hasta=&referencia=
// Pagos digitales para conciliar, más recientes primero, con un resumen.
// ---------------------------------------------------------------------
router.get('/wallet', verificarToken, concilian, async (req, res) => {
    try {
        const desde = aInstante(req.query.desde, false);
        const hasta = aInstante(req.query.hasta, true);
        if (desde === undefined || hasta === undefined) {
            return badRequest(res, 'Los filtros desde y hasta deben tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        const condiciones = [];
        const valores = [];
        const agregar = (sql, valor) => { valores.push(valor); condiciones.push(sql.replace('?', `$${valores.length}`)); };
        if (desde) agregar('v.fecha_venta >= ?', desde);
        if (hasta) agregar('v.fecha_venta <= ?', hasta);
        if (req.query.estado !== undefined) {
            const estado = String(req.query.estado).trim().toUpperCase();
            if (!ESTADOS.includes(estado)) return badRequest(res, `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
            agregar('pd.estado = ?', estado);
        }
        if (req.query.metodo !== undefined) {
            const metodo = String(req.query.metodo).trim().toUpperCase();
            if (!METODOS.includes(metodo)) return badRequest(res, `El metodo debe ser uno de: ${METODOS.join(', ')}.`);
            agregar('mp.codigo = ?', metodo);
        }
        if (req.query.referencia !== undefined && String(req.query.referencia).trim() !== '') {
            agregar('pd.referencia ILIKE ?', `%${String(req.query.referencia).trim().replace(/[\\%_]/g, '\\$&')}%`);
        }

        const { rows } = await pool.query(
            `${SELECT_PAGO}
             ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
             ORDER BY v.fecha_venta DESC, pd.id_pago DESC
             LIMIT 2000`,
            valores
        );
        // El resumen cuenta solo ventas vigentes: una venta anulada no espera dinero
        const vigentes = rows.filter((p) => p.estado_venta === 'COMPLETADA');
        const suma = (estado) => vigentes.filter((p) => p.estado === estado).reduce((s, p) => s + Number(p.total), 0);
        return res.status(200).json({
            data: rows,
            resumen: {
                pendientes: vigentes.filter((p) => p.estado === 'PENDIENTE').length,
                conciliados: vigentes.filter((p) => p.estado === 'CONCILIADO').length,
                rechazados: vigentes.filter((p) => p.estado === 'RECHAZADO').length,
                monto_pendiente: suma('PENDIENTE'),
                monto_conciliado: suma('CONCILIADO'),
                monto_rechazado: suma('RECHAZADO'),
            },
        });
    } catch (error) {
        console.error('[GET /api/payments/wallet] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar los pagos digitales.' });
    }
});

// ---------------------------------------------------------------------
// POST /api/payments/wallet-conciliation
// Body: { id_venta, estado: CONCILIADO | RECHAZADO | PENDIENTE, observacion?, referencia? }
// Conciliación manual: el Gerente o Administrador confirma contra el extracto
// que el pago llegó (CONCILIADO) o no (RECHAZADO, con observación). Se puede
// corregir; PENDIENTE la deshace.
// ---------------------------------------------------------------------
router.post('/wallet-conciliation', verificarToken, concilian, async (req, res) => {
    try {
        const { id_venta, observacion, referencia } = req.body || {};
        if (!REGEX_ID.test(String(id_venta ?? ''))) {
            return badRequest(res, 'El id_venta es obligatorio y debe ser un entero positivo.');
        }
        const estado = typeof req.body?.estado === 'string' ? req.body.estado.trim().toUpperCase() : '';
        if (!ESTADOS.includes(estado)) return badRequest(res, `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
        if (observacion !== undefined && observacion !== null && (typeof observacion !== 'string' || observacion.length > 500)) {
            return badRequest(res, 'La observacion debe ser un texto de máximo 500 caracteres.');
        }
        if (estado === 'RECHAZADO' && (typeof observacion !== 'string' || !observacion.trim())) {
            return badRequest(res, 'Para rechazar un pago debe indicar la observación.');
        }
        if (referencia !== undefined && referencia !== null && (typeof referencia !== 'string' || referencia.trim().length > 40)) {
            return badRequest(res, 'La referencia debe ser un texto de máximo 40 caracteres.');
        }

        await pool.query('SELECT fn_conciliar_pago($1, $2, $3, $4, $5)', [
            Number(id_venta), estado, req.usuario.id_usuario,
            typeof observacion === 'string' ? observacion.trim() : null,
            typeof referencia === 'string' ? referencia.trim() : null,
        ]);
        const { rows } = await pool.query(`${SELECT_PAGO} WHERE pd.id_venta = $1`, [Number(id_venta)]);
        const mensajes = { CONCILIADO: 'Pago conciliado', RECHAZADO: 'Pago rechazado', PENDIENTE: 'Conciliación deshecha: el pago vuelve a pendiente' };
        return res.status(200).json({ message: mensajes[estado], pago: rows[0] });
    } catch (error) {
        const negocio = ERRORES[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        console.error('[POST /api/payments/wallet-conciliation] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al conciliar el pago.' });
    }
});

// ---------------------------------------------------------------------
// Comprobante del pago (imagen o PDF, máximo 5 MB)
// ---------------------------------------------------------------------
// El contenido debe corresponder al tipo declarado (primeros bytes del archivo)
function coincideConTipo(datos, tipo) {
    const inicia = (...bytes) => bytes.every((b, i) => datos[i] === b);
    switch (tipo) {
        case 'application/pdf': return datos.subarray(0, 5).toString('latin1') === '%PDF-';
        case 'image/jpeg': return inicia(0xff, 0xd8, 0xff);
        case 'image/png': return inicia(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
        case 'image/webp': return datos.subarray(0, 4).toString('latin1') === 'RIFF' && datos.subarray(8, 12).toString('latin1') === 'WEBP';
        default: return false;
    }
}

// Sube (o reemplaza) el comprobante de una venta con pago digital.
// El cuerpo de la petición es el archivo tal cual, con su Content-Type; el
// nombre va en ?nombre= o en la cabecera X-Filename.
//   PUT /api/payments/wallet/:id_venta/receipt
async function subirComprobante(req, res) {
    try {
        const idVenta = req.params.id_venta ?? req.params.id;
        if (!REGEX_ID.test(String(idVenta))) return badRequest(res, 'El id de la venta debe ser un entero positivo.');
        const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!TIPOS_COMPROBANTE.includes(tipo)) {
            return res.status(415).json({ error: 'Unsupported Media Type', message: 'Solo se aceptan imágenes (JPG, PNG o WEBP) o PDF.' });
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) return badRequest(res, 'El archivo está vacío.');
        if (!coincideConTipo(req.body, tipo)) return badRequest(res, 'El contenido del archivo no corresponde a su tipo.');

        const crudo = String(req.query.nombre ?? req.headers['x-filename'] ?? '').trim();
        let nombre = crudo;
        try { nombre = decodeURIComponent(crudo); } catch { /* se deja como llegó */ }
        // Solo el nombre del archivo, sin rutas ni caracteres de control
        nombre = nombre.split(/[\\/]/).pop().replace(/[\x00-\x1f<>:"|?*]/g, '').slice(0, 200)
            || `comprobante-venta-${idVenta}.${tipo === 'application/pdf' ? 'pdf' : tipo.split('/')[1]}`;

        const { rows } = await pool.query(
            `UPDATE pagos_digitales
             SET comprobante_nombre = $2, comprobante_tipo = $3, comprobante_datos = $4,
                 comprobante_subido_por = $5, comprobante_subido_en = clock_timestamp()
             WHERE id_venta = $1
             RETURNING id_venta, comprobante_nombre AS nombre, comprobante_tipo AS tipo,
                       octet_length(comprobante_datos) AS tamano, comprobante_subido_en AS subido_en`,
            [Number(idVenta), nombre, tipo, req.body, req.usuario.id_usuario]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Not Found', message: `La venta ${idVenta} no existe o no tiene un pago por billetera virtual o transferencia.` });
        }
        return res.status(200).json({ message: 'Comprobante guardado', comprobante: rows[0] });
    } catch (error) {
        console.error('[PUT comprobante] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al guardar el comprobante.' });
    }
}

// Lee el archivo binario (solo en estas rutas; el resto de la API es JSON)
const leerArchivo = express.raw({ type: () => true, limit: TAMANO_MAXIMO });
function archivoMuyGrande(error, req, res, next) {
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload Too Large', message: 'El archivo supera el máximo de 5 MB.' });
    }
    return next(error);
}

const subenComprobante = verificarRol('VENDEDOR', 'GERENTE', 'ADMIN');
router.put('/wallet/:id_venta/receipt', verificarToken, subenComprobante, leerArchivo, archivoMuyGrande, subirComprobante);
router.post('/wallet/:id_venta/receipt', verificarToken, subenComprobante, leerArchivo, archivoMuyGrande, subirComprobante);

// GET /api/payments/wallet/:id_venta/receipt — descarga el comprobante
router.get('/wallet/:id_venta/receipt', verificarToken, concilian, async (req, res) => {
    try {
        if (!REGEX_ID.test(req.params.id_venta)) return badRequest(res, 'El id de la venta debe ser un entero positivo.');
        const { rows } = await pool.query(
            'SELECT comprobante_nombre, comprobante_tipo, comprobante_datos FROM pagos_digitales WHERE id_venta = $1',
            [Number(req.params.id_venta)]
        );
        if (rows.length === 0 || !rows[0].comprobante_datos) {
            return res.status(404).json({ error: 'Not Found', message: 'La venta no tiene comprobante guardado.' });
        }
        const { comprobante_nombre: nombre, comprobante_tipo: tipo, comprobante_datos: datos } = rows[0];
        res.setHeader('Content-Type', tipo);
        res.setHeader('Content-Length', datos.length);
        // attachment + nosniff: el navegador lo descarga, no lo interpreta
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).end(datos);
    } catch (error) {
        console.error('[GET comprobante] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al descargar el comprobante.' });
    }
});

module.exports = router;
module.exports.subirComprobante = subirComprobante;
module.exports.leerArchivo = leerArchivo;
module.exports.archivoMuyGrande = archivoMuyGrande;
