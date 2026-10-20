// backend/middleware/errorHandler.js

const errorHandler = (err, req, res, next) => {
    // 1. Loguear el error en consola para depuración del backend
    console.error(`[Error] ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    // 2. Establecer valores por defecto (Error 500 genérico)
    let statusCode = err.statusCode || 500;
    let message = err.message || "Error interno del servidor";
    let type = "ServerError";

    // 3. Capturar y formatear errores específicos de PostgreSQL (pg)
    if (err.code === '23505') { // Violación de restricción UNIQUE (Ej: correo duplicado)
        statusCode = 409;
        message = "El registro ya existe en la base de datos.";
        type = "ConflictError";
    } else if (err.code === '23503') { // Violación de llave foránea
        statusCode = 400;
        message = "El registro hace referencia a una entidad que no existe.";
        type = "ValidationError";
    } else if (err.code === '22P02') { // Sintaxis de entrada inválida (Ej: texto en lugar de número)
        statusCode = 400;
        message = "Tipo de dato inválido en la solicitud.";
        type = "ValidationError";
    }

    // 4. Capturar errores del middleware de autenticación (JWT)
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = "Token inválido o malformado.";
        type = "AuthError";
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = "El token de sesión ha expirado. Por favor, inicie sesión nuevamente.";
        type = "AuthError";
    }

    // 5. Enviar la respuesta JSON unificada y estructurada al cliente
    res.status(statusCode).json({
        status: "error",
        error: {
            type: type,
            message: message,
            // Solo envía el stacktrace en modo desarrollo por seguridad
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
};

module.exports = errorHandler;