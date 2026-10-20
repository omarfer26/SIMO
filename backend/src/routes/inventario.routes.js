// src/routes/inventario.routes.js
// Módulo de inventario. Montado en /api/inventory desde index.js.
const express = require('express');
const { postIngresoBodega } = require('../controllers/inventario.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware'); // SCRUM-16 / SCRUM-18

const router = express.Router();

// HU-05: ingreso de mercancía a Bodega (Encargado de Inventario)
router.post('/entries', verificarToken, verificarRol('INVENTARIO', 'ADMIN'), postIngresoBodega);

module.exports = router;
