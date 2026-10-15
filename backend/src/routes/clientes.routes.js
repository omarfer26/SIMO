// src/routes/clientes.routes.js
// HU-09 Gestión de clientes. Montado en /api/customers desde index.js.
const express = require('express');
const {
    postCliente,
    getClientes,
    getClientePorDocumento,
    getClientePorId,
    putCliente,
    getHistorialCliente,
} = require('../controllers/clientes.controller');
// CU-09: acceso para Vendedor, Gerente y Administrador. Pendiente del middleware
// de autenticación y roles (SCRUM-16 / SCRUM-18):
// const { requireAuth, requireRole } = require('../middlewares/auth');
// const ROLES = ['VENDEDOR', 'GERENTE', 'ADMIN'];

const router = express.Router();

router.post('/', /* requireAuth, requireRole(...ROLES), */ postCliente);
router.get('/', /* requireAuth, requireRole(...ROLES), */ getClientes);
// Antes de '/:id' para que "document" no se interprete como un id
router.get('/document/:documento', /* requireAuth, requireRole(...ROLES), */ getClientePorDocumento);
router.get('/:id', /* requireAuth, requireRole(...ROLES), */ getClientePorId);
router.put('/:id', /* requireAuth, requireRole(...ROLES), */ putCliente);
router.get('/:id/history', /* requireAuth, requireRole(...ROLES), */ getHistorialCliente);

module.exports = router;
