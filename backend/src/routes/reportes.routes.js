// src/routes/reportes.routes.js
// Consola de descargas de reportes (SCRUM-76, SCRUM-72, HU-15). Montado en /api/reports.
// Contrato del frontend: simoapp/lib/reportes/reportesService.ts
const express = require('express');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');
const { listarReportes, buscarReporte, generarReporte } = require('../services/reportes.service');
const { aInstante } = require('../utils/fechas');

const router = express.Router();
const consultan = verificarRol('ADMIN', 'GERENTE');

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

async function enviarReporte(res, reporte) {
    const archivo = await generarReporte(reporte);
    res.setHeader('Content-Type', archivo.mime);
    res.setHeader('Content-Length', archivo.datos.length);
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombreArchivo}"`);
    return res.status(200).end(archivo.datos);
}

// GET /api/reports?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&formato=EXCEL|PDF&categoria=
// Catálogo de reportes disponibles. desde/hasta filtran por la fecha de generación.
router.get('/', verificarToken, consultan, async (req, res) => {
    try {
        const desde = aInstante(req.query.desde, false);
        const hasta = aInstante(req.query.hasta, true);
        if (desde === undefined || hasta === undefined) {
            return badRequest(res, 'Los filtros desde y hasta deben tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        let formato;
        if (req.query.formato !== undefined) {
            formato = String(req.query.formato).trim().toUpperCase();
            if (!['EXCEL', 'PDF', 'WORD'].includes(formato)) return badRequest(res, 'El formato debe ser EXCEL, PDF o WORD.');
        }
        const categoria = req.query.categoria !== undefined ? String(req.query.categoria).trim().toUpperCase() : undefined;

        const data = (await listarReportes()).filter((r) => (
            (!formato || r.formato === formato)
            && (!categoria || r.categoria === categoria)
            && (!desde || r.fecha_generacion >= desde)
            && (!hasta || r.fecha_generacion <= hasta)
        ));
        return res.status(200).json({ data });
    } catch (error) {
        console.error('[GET /api/reports] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al listar los reportes.' });
    }
});

// GET /api/reports/:id/download — descarga el archivo (Excel o PDF)
router.get('/:id/download', verificarToken, consultan, async (req, res) => {
    try {
        if (!/^[1-9]\d*$/.test(req.params.id)) return badRequest(res, 'El id del reporte debe ser un entero positivo.');
        const reporte = buscarReporte(req.params.id);
        if (!reporte) return res.status(404).json({ error: 'Not Found', message: `No existe el reporte ${req.params.id}.` });
        return await enviarReporte(res, reporte);
    } catch (error) {
        console.error('[GET /api/reports/:id/download] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al generar el reporte.' });
    }
});

// Rutas de la primera versión (SCRUM-76): inventario en PDF y en Excel
for (const [ruta, id] of [['/inventory/pdf', 2], ['/inventory/excel', 1]]) {
    router.get(ruta, verificarToken, consultan, async (req, res) => {
        try {
            return await enviarReporte(res, buscarReporte(id));
        } catch (error) {
            console.error(`[GET /api/reports${ruta}] Error:`, error);
            return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al generar el reporte.' });
        }
    });
}

module.exports = router;
