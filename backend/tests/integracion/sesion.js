// tests/integracion/sesion.js
// Inicia sesión con un usuario del seed de desarrollo y devuelve el token JWT.
// Contraseña de los usuarios de prueba: Simo2026* (db/seeds/001_datos_desarrollo.sql)
const PASSWORD_SEED = 'Simo2026*';

async function iniciarSesion(puerto, correo, password = PASSWORD_SEED) {
    const res = await fetch(`http://localhost:${puerto}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correo, password }),
    });
    const body = await res.json();
    if (res.status !== 200) {
        throw new Error(`No se pudo iniciar sesión como ${correo}: ${res.status} ${body.message}`);
    }
    return body.token;
}

module.exports = { iniciarSesion, PASSWORD_SEED };
