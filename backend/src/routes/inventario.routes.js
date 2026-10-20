// src/routes/inventario.routes.js
// Módulo de inventario. Montado en /api/inventory desde index.js.
const express = require('express');
const { postIngresoBodega, postCompra, getCompra } = require('../controllers/inventario.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware'); // SCRUM-16 / SCRUM-18

const router = express.Router();

// HU-05: ingreso de mercancía a Bodega (Encargado de Inventario)
router.post('/entries', verificarToken, verificarRol('INVENTARIO', 'ADMIN'), postIngresoBodega);

// SCRUM-45: compras a proveedor con varias líneas, confirmadas con sp_confirmar_compra
router.post('/purchases', verificarToken, verificarRol('INVENTARIO', 'ADMIN'), postCompra);
router.get('/purchases/:id', verificarToken, verificarRol('INVENTARIO', 'ADMIN', 'GERENTE'), getCompra);

module.exports = router;
