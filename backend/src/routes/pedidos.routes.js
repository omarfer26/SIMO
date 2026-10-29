// src/routes/pedidos.routes.js
// Pedidos de clientes. Montado en /api/orders desde index.js.
const express = require('express');
const { postPedido, getPedidos, getPedido, patchEstadoPedido } = require('../controllers/pedidos.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');

const router = express.Router();

// SCRUM-81: el Vendedor registra los pedidos; Gerente y Administrador también pueden
router.post('/', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN'), postPedido);

// Consulta: también Inventario, que prepara los pedidos (HU-10)
router.get('/', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN', 'INVENTARIO'), getPedidos);
router.get('/:id', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN', 'INVENTARIO'), getPedido);

// SCRUM-61: avance del ciclo del pedido. Vendedor (confirma, entrega, cancela),
// Inventario (prepara y deja listo), Gerente y Administrador; por ahora los cuatro
// roles pueden aplicar cualquier transición válida del ciclo.
// /status es el nombre de la historia y el que usa el frontend; /estado, alias.
const rolesEstado = verificarRol('VENDEDOR', 'INVENTARIO', 'GERENTE', 'ADMIN');
router.patch('/:id/status', verificarToken, rolesEstado, patchEstadoPedido);
router.patch('/:id/estado', verificarToken, rolesEstado, patchEstadoPedido);

module.exports = router;
