// src/routes/inventario.routes.js
// Módulo de inventario. Montado en /api/inventory desde index.js.
const express = require('express');
const { postIngresoBodega } = require('../controllers/inventario.controller');
// Pendiente de SCRUM-16 (login JWT) y SCRUM-18 (middleware RBAC):
// const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

// HU-05: ingreso de mercancía a Bodega (Encargado de Inventario)
router.post('/entries', /* requireAuth, requireRole('INVENTARIO', 'ADMIN'), */ postIngresoBodega);

module.exports = router;
