const jwt = require('jsonwebtoken');
const pool = require('../db');
const { SECRETO } = require('../src/config/jwt');

/**
 * Middleware para autenticar el token JWT
 * Rechaza también los tokens invalidados por cierre de sesión (jwt_blacklist).
 */
const verificarToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ error: "Unauthorized", message: "No se proporcionó token de autenticación." });
    }

    const token = authHeader.split(' ')[1]; // Formato: Bearer <token>

    if (!token) {
        return res.status(401).json({ error: "Unauthorized", message: "Token malformado." });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, SECRETO);
    } catch (error) {
        return res.status(403).json({ error: "Forbidden", message: "Token inválido o expirado." });
    }

    try {
        const { rows } = await pool.query('SELECT 1 FROM jwt_blacklist WHERE token = $1', [token]);
        if (rows.length > 0) {
            return res.status(401).json({ error: "Unauthorized", message: "La sesión fue cerrada. Inicie sesión nuevamente." });
        }
    } catch (error) {
        console.error('Error al verificar la lista de tokens invalidados:', error);
        return res.status(500).json({ error: "Internal Server Error", message: "No se pudo validar la sesión." });
    }

    req.usuario = decoded; // Datos del token: id_usuario, id_rol, correo, rol (código)
    req.user = decoded;    // Alias que usan los controladores de src/
    next();
};

/**
 * Middleware para validar roles específicos (RBAC)
 * @param {...(number|string)} rolesPermitidos - IDs de rol (1 Admin, 2 Gerente,
 *   3 Inventario, 4 Vendedor) o códigos ('ADMIN', 'GERENTE', 'INVENTARIO', 'VENDEDOR')
 */
const verificarRol = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado." });
        }

        const { id_rol, rol } = req.usuario;

        // Comprobamos si el rol del usuario está incluido en los roles permitidos para la ruta
        if (!rolesPermitidos.includes(id_rol) && !rolesPermitidos.includes(rol)) {
            return res.status(403).json({
                error: "Forbidden",
                message: "No tienes permisos suficientes para realizar esta acción."
            });
        }

        next();
    };
};

module.exports = {
    verificarToken,
    verificarRol
};
