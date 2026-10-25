// tests/integracion/auth.test.js
// Pruebas de integración de login, logout y control de acceso
// (SCRUM-16, SCRUM-17, SCRUM-18 / CU-01). Requieren la base con el seed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../src/config/db');
const { iniciarSesion, PASSWORD_SEED } = require('./sesion');

const PORT = process.env.TEST_PORT_AUTH || 3996;
const API = `http://localhost:${PORT}/api`;
const SUFIJO = Date.now();
let servidor;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

async function peticion(ruta, { metodo = 'GET', cuerpo, token } = {}) {
    const res = await fetch(`${API}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { status: res.status, body: await res.json() };
}
const login = (email, password) => peticion('/auth/login', { metodo: 'POST', cuerpo: { email, password } });

async function preparar() {
    servidor = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
}

async function limpiar() {
    await pool.query(`DELETE FROM usuarios WHERE usuario LIKE $1`, [`%${SUFIJO}`]);
    await pool.end();
    servidor.kill();
}

// --------------------------------- Login (SCRUM-16 / CU-01) ---------------------------------

caso('Login devuelve token y user { id, email, rol } con el contrato del frontend', async () => {
    const { status, body } = await login('ADMIN@simo.local', PASSWORD_SEED);
    assert.equal(status, 200);
    assert.ok(body.token);
    assert.equal(body.user.email, 'admin@simo.local');
    assert.equal(body.user.rol, 'ADMIN');
    assert.ok(Number.isInteger(body.user.id));
    const datos = jwt.decode(body.token);
    assert.equal(datos.id_rol, 1);
    assert.equal(datos.rol, 'ADMIN');
    // RNF-05: la sesión expira a los 30 minutos
    assert.equal(datos.exp - datos.iat, 30 * 60);
});

caso('Login acepta también el campo "correo"', async () => {
    const { status } = await peticion('/auth/login', { metodo: 'POST', cuerpo: { correo: 'gerente@simo.local', password: PASSWORD_SEED } });
    assert.equal(status, 200);
});

caso('Mismo mensaje si falla el correo o la contraseña (CU-01 E-03)', async () => {
    const malaClave = await login('admin@simo.local', 'incorrecta');
    const sinCuenta = await login('nadie@simo.local', PASSWORD_SEED);
    assert.equal(malaClave.status, 401);
    assert.equal(sinCuenta.status, 401);
    assert.equal(malaClave.body.message, sinCuenta.body.message);
});

caso('Campos vacíos responden 400 (CU-01 E-01)', async () => {
    assert.equal((await login('', PASSWORD_SEED)).status, 400);
    assert.equal((await login('admin@simo.local', '')).status, 400);
});

caso('Cuenta inactiva con credenciales correctas responde 403 (CU-01 E-04)', async () => {
    const hash = await bcrypt.hash('ClaveInactiva1', 10);
    await pool.query(
        `INSERT INTO usuarios (id_rol, nombre_completo, correo, usuario, password_hash, estado)
         VALUES (4, 'Usuario Inactivo', $1, $2, $3, FALSE)`,
        [`inactivo${SUFIJO}@simo.local`, `inactivo${SUFIJO}`, hash]
    );
    const { status, body } = await login(`inactivo${SUFIJO}@simo.local`, 'ClaveInactiva1');
    assert.equal(status, 403);
    assert.match(body.message, /inactiva/);
});

// --------------------------------- Control de acceso (SCRUM-18) ---------------------------------

caso('Sin token, rutas protegidas responden 401', async () => {
    for (const ruta of ['/users', '/customers', '/inventory/entries']) {
        const metodo = ruta === '/inventory/entries' ? 'POST' : 'GET';
        assert.equal((await peticion(ruta, { metodo, cuerpo: metodo === 'POST' ? {} : undefined })).status, 401, ruta);
    }
});

caso('Token inválido responde 403', async () => {
    assert.equal((await peticion('/users', { token: 'no.es.un.token' })).status, 403);
});

caso('Cada rol solo accede a lo suyo (RBAC)', async () => {
    const vendedor = await iniciarSesion(PORT, 'vendedor@simo.local');
    const inventario = await iniciarSesion(PORT, 'inventario@simo.local');
    const gerente = await iniciarSesion(PORT, 'gerente@simo.local');
    assert.equal((await peticion('/users', { token: vendedor })).status, 403);
    assert.equal((await peticion('/users', { token: gerente })).status, 200);
    assert.equal((await peticion('/users', { metodo: 'POST', cuerpo: {}, token: gerente })).status, 403);
    assert.equal((await peticion('/customers', { token: vendedor })).status, 200);
    assert.equal((await peticion('/customers', { token: inventario })).status, 403);
    assert.equal((await peticion('/inventory/entries', { metodo: 'POST', cuerpo: {}, token: vendedor })).status, 403);
});

// --------------------------------- Logout (SCRUM-17) ---------------------------------

caso('Logout invalida el token: después de cerrar sesión ya no sirve', async () => {
    const token = await iniciarSesion(PORT, 'gerente@simo.local');
    assert.equal((await peticion('/users', { token })).status, 200);
    const salida = await peticion('/auth/logout', { metodo: 'POST', token });
    assert.equal(salida.status, 200);
    const despues = await peticion('/users', { token });
    assert.equal(despues.status, 401);
    assert.match(despues.body.message, /cerrada/);
});

test('Autenticación y control de acceso', async (t) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
