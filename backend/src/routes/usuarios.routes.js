// src/routes/usuarios.routes.js
// Módulo de Seguridad y Usuarios (RF-02). Montado en /api/users desde index.js.
const express = require('express');
const { postUsuario, getUsuarios, getUsuarioPorId } = require('../controllers/usuarios.controller');
// Pendiente de SCRUM-16 (login JWT) y SCRUM-18 (middleware RBAC):
// const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.post('/', /* requireAuth, requireRole('ADMIN'), */ postUsuario);
router.get('/', /* requireAuth, requireRole('ADMIN'), */ getUsuarios);
router.get('/:id', /* requireAuth, requireRole('ADMIN'), */ getUsuarioPorId);

module.exports = router;
