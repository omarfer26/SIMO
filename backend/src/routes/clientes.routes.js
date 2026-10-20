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
// CU-09: acceso para Vendedor, Gerente y Administrador (SCRUM-16 / SCRUM-18)
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');
const ROLES = ['VENDEDOR', 'GERENTE', 'ADMIN'];

const router = express.Router();

router.post('/', verificarToken, verificarRol(...ROLES), postCliente);
router.get('/', verificarToken, verificarRol(...ROLES), getClientes);
// Antes de '/:id' para que "document" no se interprete como un id
router.get('/document/:documento', verificarToken, verificarRol(...ROLES), getClientePorDocumento);
router.get('/:id', verificarToken, verificarRol(...ROLES), getClientePorId);
router.put('/:id', verificarToken, verificarRol(...ROLES), putCliente);
router.get('/:id/history', verificarToken, verificarRol(...ROLES), getHistorialCliente);

module.exports = router;
