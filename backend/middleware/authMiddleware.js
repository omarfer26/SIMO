const jwt = require('jsonwebtoken');

/**
 * Middleware para autenticar el token JWT
 */
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ error: "Unauthorized", message: "No se proporcionó token de autenticación." });
    }

    const token = authHeader.split(' ')[1]; // Formato: Bearer <token>

    if (!token) {
        return res.status(401).json({ error: "Unauthorized", message: "Token malformado." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'Simo2026_Secreto_Super_Seguro!');
        req.usuario = decoded; // Guardamos los datos del token en la request (ej: id_usuario, id_rol, correo)
        next();
    } catch (error) {
        return res.status(403).json({ error: "Forbidden", message: "Token inválido o expirado." });
    }
};

/**
 * Middleware para validar roles específicos (RBAC)
 * @param {...number} rolesPermitidos - IDs o códigos de roles permitidos (ej: 1 para Admin, 2 para Gerente)
 */
const verificarRol = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado." });
        }

        const { id_rol } = req.usuario;

        // Comprobamos si el rol del usuario está incluido en los roles permitidos para la ruta
        if (!rolesPermitidos.includes(id_rol)) {
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