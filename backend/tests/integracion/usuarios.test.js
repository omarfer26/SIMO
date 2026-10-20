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
const bcrypt = require('bcrypt');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');

const PORT = process.env.TEST_PORT || 3999;
const BASE = `http://localhost:${PORT}/api/users`;
const SUFIJO = Date.now();
let servidor;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

let token; // sesión del Administrador (seed)

async function api(ruta = '', opciones = {}) {
    const res = await fetch(`${BASE}${ruta}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    servidor = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
    token = await iniciarSesion(PORT, 'admin@simo.local');
}

async function detenerServidor() {
    await pool.query(`UPDATE usuarios SET estado = TRUE WHERE usuario = 'admin'`);
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

// ------------------------------- PUT /api/users/:id (SCRUM-24) ------------------------------

const ROL = { ADMIN: 1, GERENTE: 2, INVENTARIO: 3, VENDEDOR: 4 };
const editar = (id, cuerpo) => api(`/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
async function crearDePrueba(sufijo, idRol = ROL.VENDEDOR) {
    const { status, body } = await api('', {
        method: 'POST',
        body: JSON.stringify(nuevoUsuario({ id_rol: idRol, correo: `${sufijo}${SUFIJO}@simo.local`, usuario: `${sufijo}${SUFIJO}` })),
    });
    assert.equal(status, 201, `no se pudo crear ${sufijo}`);
    return body.usuario.id_usuario;
}

caso('PUT edita nombre, correo, usuario y rol con el contrato del frontend (SCRUM-21)', async () => {
    const id = await crearDePrueba('editar');
    const { status, body } = await editar(id, {
        id_rol: ROL.GERENTE,
        nombre_completo: '  Nombre Editado ',
        correo: `Editado${SUFIJO}@SIMO.local`,
        usuario: `editado${SUFIJO}`,
    });
    assert.equal(status, 200);
    assert.equal(body.message, 'Usuario actualizado exitosamente');
    assert.equal(body.usuario.nombre_completo, 'Nombre Editado');
    assert.equal(body.usuario.correo, `editado${SUFIJO}@simo.local`);
    assert.equal(body.usuario.usuario, `editado${SUFIJO}`);
    assert.equal(body.usuario.rol_codigo, 'GERENTE');
    assert.equal(body.usuario.password_hash, undefined);
    for (const campo of ['id_usuario', 'nombre_completo', 'correo', 'usuario', 'estado', 'rol_codigo']) {
        assert.ok(body.usuario[campo] !== undefined, `falta ${campo}`);
    }
});

caso('PUT permite editar un solo campo y conservar su propio correo y usuario', async () => {
    const id = await crearDePrueba('parcial');
    const parcial = await editar(id, { nombre_completo: 'Solo el nombre' });
    assert.equal(parcial.status, 200);
    assert.equal(parcial.body.usuario.correo, `parcial${SUFIJO}@simo.local`);
    const mismos = await editar(id, { correo: `parcial${SUFIJO}@simo.local`, usuario: `parcial${SUFIJO}` });
    assert.equal(mismos.status, 200);
});

caso('PUT responde 409 si el correo o el usuario ya son de otro usuario', async () => {
    const id = await crearDePrueba('dupa');
    await crearDePrueba('dupb');
    assert.equal((await editar(id, { correo: `DUPB${SUFIJO}@simo.local` })).status, 409);
    assert.equal((await editar(id, { usuario: `dupb${SUFIJO}` })).status, 409);
    assert.equal((await editar(id, { correo: 'admin@simo.local' })).status, 409);
});

caso('PUT valida datos y rechaza contraseña y estado (400), 404 si no existe', async () => {
    const id = await crearDePrueba('valida');
    for (const [cuerpo, caso] of [
        [{}, 'cuerpo vacío'],
        [{ nombre_completo: '  ' }, 'nombre vacío'],
        [{ correo: 'sin-arroba' }, 'correo inválido'],
        [{ usuario: '' }, 'usuario vacío'],
        [{ id_rol: 999 }, 'rol inexistente'],
        [{ password: 'OtraClave123' }, 'contraseña'],
        [{ estado: false }, 'estado'],
    ]) {
        assert.equal((await editar(id, cuerpo)).status, 400, caso);
    }
    assert.equal((await editar(99999999, { nombre_completo: 'X' })).status, 404);
    assert.equal((await editar('abc', { nombre_completo: 'X' })).status, 400);
});

caso('PUT no deja quitar el rol de Administrador al último administrador activo', async () => {
    const { rows } = await pool.query(
        `SELECT u.id_usuario FROM usuarios u JOIN roles r USING (id_rol) WHERE r.codigo = 'ADMIN' AND u.estado`
    );
    assert.equal(rows.length, 1, 'la prueba asume un solo administrador activo (el del seed)');
    const { status, body } = await editar(rows[0].id_usuario, { id_rol: ROL.VENDEDOR });
    assert.equal(status, 409);
    assert.match(body.message, /último administrador/);
    // Sí puede editar sus otros datos
    assert.equal((await editar(rows[0].id_usuario, { nombre_completo: 'Administrador SIMO' })).status, 200);
});

caso('Dos administradores que se quitan el rol al mismo tiempo: queda al menos uno', async () => {
    const a = await crearDePrueba('admina', ROL.ADMIN);
    const b = await crearDePrueba('adminb', ROL.ADMIN);
    // Por un momento, los únicos administradores activos son a y b (se restaura al terminar)
    await pool.query(`UPDATE usuarios SET estado = FALSE WHERE usuario = 'admin'`);
    try {
        const respuestas = await Promise.all([editar(a, { id_rol: ROL.VENDEDOR }), editar(b, { id_rol: ROL.VENDEDOR })]);
        assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 409]);
        const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM usuarios u JOIN roles r USING (id_rol)
             WHERE r.codigo = 'ADMIN' AND u.estado AND u.id_usuario IN ($1, $2)`,
            [a, b]
        );
        assert.equal(rows[0].n, 1);
    } finally {
        await pool.query(`UPDATE usuarios SET estado = TRUE WHERE usuario = 'admin'`);
    }
});

// ------------------- Contrato con el frontend (simoapp/lib/auth/authService.ts) -------------------

caso('Contrato del frontend: POST devuelve usuario con id, nombre, correo, usuario y rol_codigo', async () => {
    const datos = nuevoUsuario({ correo: `contrato${SUFIJO}@simo.local`, usuario: `contrato${SUFIJO}`, id_rol: 3 });
    const { status, body } = await api('', { method: 'POST', body: JSON.stringify(datos) });
    assert.equal(status, 201);
    for (const campo of ['id_usuario', 'nombre_completo', 'correo', 'usuario', 'rol_codigo']) {
        assert.ok(body.usuario[campo] !== undefined, `falta usuario.${campo}`);
    }
    assert.equal(body.usuario.rol_codigo, 'INVENTARIO');
});

caso('Contrato del frontend: GET ?limit=100 devuelve data[] con id, nombre, correo, usuario, estado y rol_codigo', async () => {
    const { status, body } = await api('?limit=100');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data) && body.pagination.totalPages >= 1);
    for (const u of body.data) {
        for (const campo of ['id_usuario', 'nombre_completo', 'correo', 'usuario', 'estado', 'rol_codigo']) {
            assert.ok(u[campo] !== undefined, `falta ${campo}`);
        }
    }
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
