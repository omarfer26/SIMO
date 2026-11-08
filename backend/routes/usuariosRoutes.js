const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

// 1. Importar los middlewares de autorización
const { verificarToken, verificarRol } = require('../middleware/authMiddleware');

const router = express.Router();

// =====================================================================
// GET /api/users - Listar usuarios (Accesible para ADMIN y GERENTE)
// =====================================================================
router.get('/', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        const query = 'SELECT id_usuario, correo, id_rol, estado FROM usuarios ORDER BY id_usuario DESC';
        const { rows } = await pool.query(query);
        res.status(200).json(rows);
    } catch (error) {
        // Delegamos el error interno al manejador global (errorHandler.js)
        next(error);
    }
});

// =====================================================================
// POST /api/users - Crear usuario (Exclusivo para ADMIN) (SCRUM-140)
// =====================================================================
router.post('/', verificarToken, verificarRol(1), async (req, res, next) => {
    const { correo, password, id_rol } = req.body;

    // Validación de entrada
    if (!correo || !password || !id_rol) {
        const error = new Error("Faltan campos obligatorios (correo, password, id_rol).");
        error.statusCode = 400;
        return next(error); // Enviamos el error 400 al manejador global
    }

    try {
        // Encriptar la contraseña con bcrypt
        const passwordHash = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO usuarios (correo, password_hash, id_rol) 
            VALUES ($1, $2, $3) RETURNING id_usuario, correo, id_rol, estado;
        `;
        const { rows } = await pool.query(insertQuery, [correo, passwordHash, id_rol]);

        res.status(201).json({
            status: "success",
            message: "Usuario creado exitosamente",
            usuario: rows[0]
        });
    } catch (error) {
        // Pasamos cualquier error de PostgreSQL (como el 23505 de correo duplicado) 
        // al middleware centralizado, el cual lo formateará adecuadamente
        next(error);
    }
});

module.exports = router;