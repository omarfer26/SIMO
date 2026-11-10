// src/routes/ventas.routes.js
// Ventas POS y anulación. Montado en /api/sales desde index.js.
const express = require('express');
const {
    postVenta, getVentas, getVenta, getResumenDiario, postAnularVenta,
} = require('../controllers/ventas.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');
const { subirComprobante, leerArchivo, archivoMuyGrande } = require('./pagos.routes');

const router = express.Router();

// HU-07: el Vendedor opera el POS (matriz de roles del frontend, lib/auth/permisos.ts)
router.post('/', verificarToken, verificarRol('VENDEDOR', 'ADMIN'), postVenta);

// Historial (pantalla de ventas y Dashboard) y arqueo de caja
router.get('/', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN'), getVentas);
router.get('/daily-summary', verificarToken, verificarRol('GERENTE', 'ADMIN'), getResumenDiario);
router.get('/:id', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN'), getVenta);

// CU-11 / SCRUM-54: anulación con credenciales de Gerente o Administrador.
// /cancel es la ruta que usa el frontend; /annul, el nombre de la historia.
const rolesAnulan = verificarRol('VENDEDOR', 'GERENTE', 'ADMIN');
router.post('/:id/cancel', verificarToken, rolesAnulan, postAnularVenta);
router.post('/:id/annul', verificarToken, rolesAnulan, postAnularVenta);
router.put('/:id/cancel', verificarToken, rolesAnulan, postAnularVenta);

// SCRUM-73/78: comprobante del pago digital de la venta (imagen o PDF como cuerpo
// de la petición). Misma operación que PUT /api/payments/wallet/:id_venta/receipt.
router.post('/:id/comprobante', verificarToken, rolesAnulan, leerArchivo, archivoMuyGrande, subirComprobante);

module.exports = router;
