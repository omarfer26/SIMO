// src/config/jwt.js
// Configuración única del JWT: la usan el login (firma) y el middleware de
// autenticación (verificación). Antes cada uno leía la clave por su cuenta y,
// sin JWT_SECRET definido, el login fallaba mientras el middleware usaba otra.
const SECRETO_DESARROLLO = 'Simo2026_Secreto_Super_Seguro!';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  JWT_SECRET no está definido: se usa la clave de desarrollo. Defínalo en producción.');
}

module.exports = {
    SECRETO: process.env.JWT_SECRET || SECRETO_DESARROLLO,
    // RNF-05: la sesión expira a los 30 minutos
    EXPIRACION: process.env.JWT_EXPIRES_IN || '30m',
};
