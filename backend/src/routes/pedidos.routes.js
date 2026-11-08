// src/routes/pedidos.routes.js
// HU-10: ciclo secuencial de pedidos y reserva en preparación.
// Montado en /api/orders desde index.js.
const express = require('express');
const {
    getPedidos,
    getPedidoPorId,
    postPedido,
    patchEstadoPedido,
} = require('../controllers/pedidos.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');

// HU-10 (CU-12/CU-13): Vendedor, Gerente y Administrador gestionan el ciclo.
// Inventario puede CONSULTAR (necesita ver los pedidos para prepararlos) pero
// no mover estados: el stock lo compromete la reserva de la base.
const ROLES_GESTION = ['VENDEDOR', 'GERENTE', 'ADMIN'];
const ROLES_CONSULTA = [...ROLES_GESTION, 'INVENTARIO'];

const router = express.Router();

router.get('/', verificarToken, verificarRol(...ROLES_CONSULTA), getPedidos);
router.get('/:id', verificarToken, verificarRol(...ROLES_CONSULTA), getPedidoPorId);
router.post('/', verificarToken, verificarRol(...ROLES_GESTION), postPedido);
router.patch('/:id/status', verificarToken, verificarRol(...ROLES_GESTION), patchEstadoPedido);

module.exports = router;
