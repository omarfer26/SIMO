const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// GET /api/users - Listar usuarios
router.get('/', async (req, res) => {
    try {
        const query = 'SELECT id_usuario, correo, id_rol, estado FROM usuarios ORDER BY id_usuario DESC';
        const { rows } = await pool.query(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ error: "Internal Server Error", message: "Error al consultar usuarios." });
    }
});

// POST /api/users - Crear usuario
router.post('/', async (req, res) => {
    const { correo, password, id_rol } = req.body;

    if (!correo || !password || !id_rol) {
        return res.status(400).json({ error: "Bad Request", message: "Faltan campos obligatorios." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const insertQuery = `
            INSERT INTO usuarios (correo, password_hash, id_rol) 
            VALUES ($1, $2, $3) RETURNING id_usuario, correo, id_rol, estado;
        `;
        const { rows } = await pool.query(insertQuery, [correo, passwordHash, id_rol]);

        res.status(201).json({ message: "Usuario creado exitosamente", usuario: rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: "Conflict", message: "El correo electrónico ya está registrado." });
        }
        console.error('Error al crear usuario:', error);
        res.status(500).json({ error: "Internal Server Error", message: "Error al guardar el usuario." });
    }
});

module.exports = router;