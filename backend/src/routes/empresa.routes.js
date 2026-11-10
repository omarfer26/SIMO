// src/routes/empresa.routes.js
// (Camilo) — Datos de la empresa (RF-04). Montado en /api/company.
// La tabla `empresa` (migración 002) tiene un único registro (id_empresa = 1)
// que hasta ahora ninguna ruta leía: el Navbar, el ticket del POS y la página
// /admin usaban datos de prueba. Contrato del frontend:
// simoapp/lib/empresa/empresaService.ts
//
//   GET /api/company   (cualquier usuario con sesión: el Navbar y el ticket
//                       lo necesitan para todos los roles)
//     Responde 200: { empresa: { razon_social, nit, telefono, direccion,
//                                logo_url, actualizado_en } }
//   PUT /api/company   (solo ADMIN)
//     Body: { razon_social, nit, telefono?, direccion?, logo_url? }
//     Actualiza el registro y deja ACTUALIZACION_EMPRESA en log_auditoria con
//     la foto de antes y después, en la misma transacción (RF-24).
//     Responde 200: { message, empresa }
const express = require('express');
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');

const router = express.Router();

const COLUMNAS = 'razon_social, nit, telefono, direccion, logo_url, actualizado_en';

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

// Texto obligatorio u opcional con largo máximo (los de la tabla).
function leerTexto(valor, { campo, maximo, obligatorio }) {
    if (valor === undefined || valor === null || (typeof valor === 'string' && !valor.trim())) {
        return obligatorio ? { error: `El campo ${campo} es obligatorio.` } : { valor: null };
    }
    if (typeof valor !== 'string') return { error: `El campo ${campo} debe ser texto.` };
    const limpio = valor.trim();
    if (limpio.length > maximo) return { error: `El campo ${campo} admite máximo ${maximo} caracteres.` };
    return { valor: limpio };
}

router.get('/', verificarToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM empresa WHERE id_empresa = 1`);
        if (!rows[0]) {
            return res.status(404).json({ error: 'Not Found', message: 'Los datos de la empresa aún no se han registrado.' });
        }
        return res.status(200).json({ empresa: rows[0] });
    } catch (error) {
        console.error('[GET /api/company] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar la empresa.' });
    }
});

router.put('/', verificarToken, verificarRol('ADMIN'), async (req, res) => {
    const cuerpo = req.body || {};
    const campos = {};
    for (const [campo, maximo, obligatorio] of [
        ['razon_social', 150, true],
        ['nit', 20, true],
        ['telefono', 30, false],
        ['direccion', 200, false],
    ]) {
        const { valor, error } = leerTexto(cuerpo[campo], { campo, maximo, obligatorio });
        if (error) return badRequest(res, error);
        campos[campo] = valor;
    }
    // El logo solo se guarda si es una dirección web: el archivo en sí todavía
    // no se sube a ningún servidor (no hay almacenamiento de archivos).
    let logo;
    if (cuerpo.logo_url !== undefined) {
        const { valor, error } = leerTexto(cuerpo.logo_url, { campo: 'logo_url', maximo: 500, obligatorio: false });
        if (error) return badRequest(res, error);
        if (valor && !/^https?:\/\//i.test(valor)) return badRequest(res, 'El logo_url debe ser una dirección http(s).');
        logo = valor;
    }

    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const anterior = await cliente.query(`SELECT ${COLUMNAS} FROM empresa WHERE id_empresa = 1 FOR UPDATE`);
        const { rows } = await cliente.query(
            `INSERT INTO empresa (id_empresa, razon_social, nit, telefono, direccion, logo_url)
             VALUES (1, $1, $2, $3, $4, $5)
             ON CONFLICT (id_empresa) DO UPDATE
                SET razon_social = EXCLUDED.razon_social,
                    nit          = EXCLUDED.nit,
                    telefono     = EXCLUDED.telefono,
                    direccion    = EXCLUDED.direccion,
                    logo_url     = CASE WHEN $6 THEN EXCLUDED.logo_url ELSE empresa.logo_url END
             RETURNING ${COLUMNAS}`,
            [campos.razon_social, campos.nit, campos.telefono, campos.direccion, logo ?? null, logo !== undefined]
        );
        await cliente.query(
            `INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, datos_anteriores, datos_nuevos, direccion_ip)
             VALUES ($1, 'ACTUALIZACION_EMPRESA', 'empresa', 1, $2, $3, $4)`,
            [req.user.id_usuario, anterior.rows[0] ?? null, rows[0], req.ip || null]
        );
        await cliente.query('COMMIT');
        return res.status(200).json({ message: 'Datos de la empresa actualizados', empresa: rows[0] });
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.error('[PUT /api/company] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al actualizar la empresa.' });
    } finally {
        cliente.release();
    }
});

module.exports = router;
