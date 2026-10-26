// src/routes/pedidos.routes.js
// Pedidos de clientes. Montado en /api/orders desde index.js.
const express = require('express');
const { postPedido, getPedidos, getPedido } = require('../controllers/pedidos.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');

const router = express.Router();

// SCRUM-81: el Vendedor registra los pedidos; Gerente y Administrador también pueden
router.post('/', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN'), postPedido);

// Consulta: también Inventario, que prepara los pedidos (HU-10)
router.get('/', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN', 'INVENTARIO'), getPedidos);
router.get('/:id', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN', 'INVENTARIO'), getPedido);

module.exports = router;
