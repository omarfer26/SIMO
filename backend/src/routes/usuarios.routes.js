// src/routes/usuarios.routes.js
// Módulo de Seguridad y Usuarios (RF-02). Montado en /api/users desde index.js.
const express = require('express');
const { postUsuario, getUsuarios, getUsuarioPorId, putUsuario, patchEstadoUsuario } = require('../controllers/usuarios.controller');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware'); // SCRUM-16 / SCRUM-18

const router = express.Router();

router.post('/', verificarToken, verificarRol('ADMIN'), postUsuario);
router.get('/', verificarToken, verificarRol('ADMIN', 'GERENTE'), getUsuarios);
router.get('/:id', verificarToken, verificarRol('ADMIN', 'GERENTE'), getUsuarioPorId);
router.put('/:id', verificarToken, verificarRol('ADMIN'), putUsuario);
// SCRUM-25: /status (Jira) y /estado (ruta que usa el frontend en SCRUM-21)
router.patch('/:id/status', verificarToken, verificarRol('ADMIN'), patchEstadoUsuario);
router.patch('/:id/estado', verificarToken, verificarRol('ADMIN'), patchEstadoUsuario);

module.exports = router;
