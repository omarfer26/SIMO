// src/routes/pedidos.routes.js
// Pedidos de clientes. Montado en /api/orders desde index.js.
const express = require('express');
const { postPedido, getPedidos, getPedido, patchEstadoPedido, postConvertirEnVenta, postCancelarPedido } = require('../controllers/pedidos.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');

const router = express.Router();

// SCRUM-81 / EP-04: registra el Vendedor. En Pedidos el Administrador y el
// Gerente son de solo lectura y el Inventario alista.
router.post('/', verificarToken, verificarRol('VENDEDOR'), postPedido);

// Consulta: también Inventario, que prepara los pedidos (HU-10)
router.get('/', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN', 'INVENTARIO'), getPedidos);
router.get('/:id', verificarToken, verificarRol('VENDEDOR', 'GERENTE', 'ADMIN', 'INVENTARIO'), getPedido);

// SCRUM-61: avance del ciclo del pedido. La ruta deja pasar a los dos roles que
// lo mueven y el controlador decide, por rol, hasta qué estado llega cada uno
// (EP-04): el Vendedor recorre todo el ciclo, el Inventario solo alista.
// /status es el nombre de la historia y el que usa el frontend; /estado, alias.
const rolesEstado = verificarRol('VENDEDOR', 'INVENTARIO');
router.patch('/:id/status', verificarToken, rolesEstado, patchEstadoPedido);
router.patch('/:id/estado', verificarToken, rolesEstado, patchEstadoPedido);

// SCRUM-100: cancelación con causa obligatoria y comprobante (CU-13). Actor
// principal y único: el Vendedor (EP-04: los demás roles solo leen).
// /cancelar es alias.
router.post('/:id/cancel', verificarToken, verificarRol('VENDEDOR'), postCancelarPedido);
router.post('/:id/cancelar', verificarToken, verificarRol('VENDEDOR'), postCancelarPedido);

// SCRUM-62: pedido entregado -> venta en un clic (HU-12). Lo hace el Vendedor,
// que es quien opera las ventas (EP-03). /convertir-venta, alias.
const rolesVenta = verificarRol('VENDEDOR');
router.post('/:id/convert-to-sale', verificarToken, rolesVenta, postConvertirEnVenta);
router.post('/:id/convertir-venta', verificarToken, rolesVenta, postConvertirEnVenta);

module.exports = router;
