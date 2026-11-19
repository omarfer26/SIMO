// src/config/jwt.js
// Configuración única del JWT: la usan el login (firma) y el middleware de
// autenticación (verificación). Antes cada uno leía la clave por su cuenta y,
// sin JWT_SECRET definido, el login fallaba mientras el middleware usaba otra.
const SECRETO_DESARROLLO = 'Simo2026_Secreto_Super_Seguro!';

// En producción la API NO arranca sin una clave propia: la de desarrollo está
// publicada en el repositorio y con ella cualquiera podría fabricar un token
// válido de administrador (SCRUM-173).
const LONGITUD_MINIMA = 32;
if (process.env.NODE_ENV === 'production') {
    const clave = process.env.JWT_SECRET || '';
    if (clave.length < LONGITUD_MINIMA || clave === SECRETO_DESARROLLO) {
        throw new Error(`JWT_SECRET no está definido o es inseguro: en producción debe tener al menos ${LONGITUD_MINIMA} caracteres aleatorios `
            + "(por ejemplo: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\")");
    }
}

module.exports = {
    SECRETO: process.env.JWT_SECRET || SECRETO_DESARROLLO,
    // RNF-05: la sesión expira a los 30 minutos
    EXPIRACION: process.env.JWT_EXPIRES_IN || '30m',
};
