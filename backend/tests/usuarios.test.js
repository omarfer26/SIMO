// tests/usuarios.test.js
// Pruebas de integración del módulo de usuarios (SCRUM-22, SCRUM-23).
// Requieren la base creada con db/00_init.sh (migraciones + seed) y las
// variables DB_* del .env. Levantan index.js en un puerto aparte y limpian
// los usuarios que crean.
//
//   npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const PORT = process.env.TEST_PORT || 3999;
const BASE = `http://localhost:${PORT}/api/users`;
const SUFIJO = Date.now();
let servidor;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

async function api(ruta = '', opciones = {}) {
    const res = await fetch(`${BASE}${ruta}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opciones,
    });
    return { status: res.status, body: await res.json() };
}

function nuevoUsuario(extra = {}) {
    return {
        id_rol: 4,
        nombre_completo: 'Usuario Prueba',
        correo: `prueba${SUFIJO}@simo.local`,
        usuario: `prueba${SUFIJO}`,
        password: 'ClaveSegura1',
        ...extra,
    };
}

async function iniciarServidor() {
    servidor = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
}

async function detenerServidor() {
    await pool.query(`DELETE FROM usuarios WHERE usuario LIKE $1`, [`%${SUFIJO}`]);
    await pool.end();
    servidor.kill();
}

// ------------------------------- GET /api/users -------------------------------

caso('GET lista paginada con valores por defecto y sin password_hash', async () => {
    const { status, body } = await api();
    assert.equal(status, 200);
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 10);
    assert.ok(body.pagination.total >= 4);
    assert.ok(body.data.length > 0);
    for (const u of body.data) {
        assert.equal(u.password_hash, undefined);
        assert.ok(u.rol_codigo && u.rol_nombre);
    }
});

caso('GET filtra por código de rol (sin importar mayúsculas)', async () => {
    const { status, body } = await api('?rol=vendedor');
    assert.equal(status, 200);
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((u) => u.rol_codigo === 'VENDEDOR'));
});

caso('GET filtra por id_rol y estado', async () => {
    const activos = await api('?id_rol=1&estado=true');
    assert.equal(activos.status, 200);
    assert.ok(activos.body.data.every((u) => u.id_rol === 1 && u.estado === true));

    const inactivos = await api('?estado=false');
    assert.equal(inactivos.status, 200);
    assert.ok(inactivos.body.data.every((u) => u.estado === false));
});

caso('GET busca por texto en nombre, correo o usuario', async () => {
    const { body } = await api('?q=GERENTE');
    assert.ok(body.data.some((u) => u.usuario === 'gerente'));
});

caso('GET trata los comodines de búsqueda como texto literal', async () => {
    const { status, body } = await api(`?q=${encodeURIComponent('%')}`);
    assert.equal(status, 200);
    assert.equal(body.pagination.total, 0);
});

caso('GET pagina de forma consistente', async () => {
    const p1 = await api('?limit=2&page=1');
    const p2 = await api('?limit=2&page=2');
    assert.equal(p1.body.data.length, 2);
    assert.equal(p1.body.pagination.totalPages, Math.ceil(p1.body.pagination.total / 2));
    const ids1 = p1.body.data.map((u) => u.id_usuario);
    assert.ok(p2.body.data.every((u) => !ids1.includes(u.id_usuario)));
});

caso('GET rechaza parámetros inválidos con 400', async () => {
    for (const q of ['?page=0', '?page=abc', '?limit=101', '?limit=0', '?estado=si', '?id_rol=x', '?rol=AD-MIN']) {
        const { status, body } = await api(q);
        assert.equal(status, 400, `se esperaba 400 para ${q}`);
        assert.equal(body.error, 'Bad Request');
    }
});

caso('GET /:id devuelve el usuario, 404 si no existe y 400 si el id es inválido', async () => {
    const ok = await api('/1');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.id_usuario, 1);
    assert.equal(ok.body.password_hash, undefined);

    assert.equal((await api('/999999')).status, 404);
    assert.equal((await api('/abc')).status, 400);
});

// ------------------------------- POST /api/users ------------------------------

caso('POST crea el usuario, normaliza el correo y guarda la contraseña con bcrypt', async () => {
    const datos = nuevoUsuario({ correo: `Prueba${SUFIJO}@SIMO.local` });
    const { status, body } = await api('', { method: 'POST', body: JSON.stringify(datos) });
    assert.equal(status, 201);
    assert.equal(body.usuario.correo, `prueba${SUFIJO}@simo.local`);
    assert.equal(body.usuario.rol_codigo, 'VENDEDOR');
    assert.equal(body.usuario.password_hash, undefined);

    const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id_usuario = $1', [body.usuario.id_usuario]);
    assert.ok(rows[0].password_hash.startsWith('$2'));
    assert.ok(await bcrypt.compare('ClaveSegura1', rows[0].password_hash));
});

caso('POST rechaza correo duplicado aunque cambien las mayúsculas (409)', async () => {
    const datos = nuevoUsuario({ correo: `PRUEBA${SUFIJO}@simo.local`, usuario: `otro${SUFIJO}` });
    const { status } = await api('', { method: 'POST', body: JSON.stringify(datos) });
    assert.equal(status, 409);
});

caso('POST valida campos, formato de correo, contraseña y rol (400)', async () => {
    const casos = [
        [{}, 'campos vacíos'],
        [nuevoUsuario({ correo: 'sin-arroba', usuario: `a${SUFIJO}` }), 'correo inválido'],
        [nuevoUsuario({ password: 'corta', usuario: `b${SUFIJO}`, correo: `b${SUFIJO}@simo.local` }), 'contraseña corta'],
        [nuevoUsuario({ id_rol: 999, usuario: `c${SUFIJO}`, correo: `c${SUFIJO}@simo.local` }), 'rol inexistente'],
    ];
    for (const [datos, caso] of casos) {
        const { status } = await api('', { method: 'POST', body: JSON.stringify(datos) });
        assert.equal(status, 400, caso);
    }
    const { body } = await api('', { method: 'POST', body: '{}' });
    assert.deepEqual(body.campos, ['id_rol', 'nombre_completo', 'correo', 'usuario', 'password']);
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
// (before/after de node:test solo existen desde 18.8).
test('Módulo de usuarios', async (t) => {
    await iniciarServidor();
    try {
        for (const [nombre, fn] of casos) {
            await t.test(nombre, fn);
        }
    } finally {
        await detenerServidor();
    }
});
