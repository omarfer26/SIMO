// tests/clientes.test.js
// Pruebas de integración de la gestión de clientes (SCRUM-98 / HU-09 / CU-09).
// Requieren la base creada con db/00_init.sh (migraciones + seed) y las
// variables DB_* (o DATABASE_URL) del .env. Levantan index.js en un puerto aparte.
//
// Cada ejecución usa documentos propios (prefijo 77 + marca de tiempo). Los
// clientes con pedidos no se pueden borrar (el historial de pedidos es
// inalterable), así que al terminar se dejan inactivos.
//
//   npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');

const PORT = process.env.TEST_PORT_CLIENTES || 3997;
const BASE = `http://localhost:${PORT}/api/customers`;
const SUFIJO = String(Date.now()).slice(-8);
const DOC = (n) => `77${SUFIJO}${n}`; // documento único por ejecución
let servidor;
const ref = {};
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

async function api(ruta = '', opciones = {}) {
    const res = await fetch(`${BASE}${ruta}`, { headers: { 'Content-Type': 'application/json' }, ...opciones });
    return { status: res.status, body: await res.json() };
}
const crear = (cuerpo) => api('', { method: 'POST', body: JSON.stringify(cuerpo) });
const editar = (id, cuerpo) => api(`/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });

async function preparar() {
    ref.vendedor = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor'`)).rows[0].id_usuario;
    ref.gerente = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'gerente'`)).rows[0].id_usuario;
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
    await pool.query(`UPDATE clientes SET estado = FALSE WHERE identificacion LIKE $1`, [`77${SUFIJO}%`]);
    await pool.end();
    servidor.kill();
}

// --------------------------------- Registro ---------------------------------

caso('Registra un cliente y normaliza documento, nombre y correo (CU-09 CA-1)', async () => {
    const { status, body } = await crear({
        identificacion: `77.${SUFIJO}.1`,
        nombre: '  Ana   María  Pérez ',
        telefono: '300 123 4567',
        correo: 'Ana.Perez@Correo.COM',
        direccion: 'Calle 10 # 5-20',
    });
    assert.equal(status, 201);
    assert.equal(body.message, 'Cliente guardado con éxito');
    assert.equal(body.cliente.identificacion, DOC(1));
    assert.equal(body.cliente.tipo_identificacion, 'CC');
    assert.equal(body.cliente.nombre, 'Ana María Pérez');
    assert.equal(body.cliente.correo, 'ana.perez@correo.com');
    assert.equal(body.cliente.estado, true);
    ref.ana = body.cliente.id_cliente;
});

caso('Rechaza un documento ya registrado y devuelve el cliente existente (CU-09 EX-1, CA-2)', async () => {
    const { status, body } = await crear({ identificacion: `${DOC(1)}`.replace(/^77/, '77.'), nombre: 'Otro nombre' });
    assert.equal(status, 409);
    assert.equal(body.message, 'El documento de identidad ya se encuentra registrado.');
    assert.equal(body.cliente.id_cliente, ref.ana);
    assert.equal(body.cliente.nombre, 'Ana María Pérez');
});

caso('Acepta NIT y los campos opcionales vacíos', async () => {
    const { status, body } = await crear({ tipo_identificacion: 'nit', identificacion: `${DOC(2)}-7`, nombre: 'Comercial XYZ S.A.S.', correo: '' });
    assert.equal(status, 201);
    assert.equal(body.cliente.tipo_identificacion, 'NIT');
    assert.equal(body.cliente.correo, null);
    ref.empresa = body.cliente.id_cliente;
});

caso('Valida documento, nombre, tipo, correo y teléfono (400)', async () => {
    const casosInvalidos = [
        [{ nombre: 'Sin documento' }, 'documento'],
        [{ identificacion: DOC(3) }, 'nombre'],
        [{ identificacion: DOC(3), nombre: '   ' }, 'nombre vacío'],
        [{ identificacion: DOC(3), nombre: 'X', tipo_identificacion: 'RUT' }, 'tipo'],
        [{ identificacion: DOC(3), nombre: 'X', correo: 'sin-arroba' }, 'correo'],
        [{ identificacion: DOC(3), nombre: 'X', telefono: '12' }, 'teléfono'],
        [{ identificacion: 'a$b', nombre: 'X' }, 'documento con símbolos'],
        [{ identificacion: DOC(3), nombre: 'X', estado: false }, 'estado al crear'],
    ];
    for (const [cuerpo, caso] of casosInvalidos) {
        assert.equal((await crear(cuerpo)).status, 400, caso);
    }
});

caso('10 registros simultáneos del mismo documento crean un solo cliente', async () => {
    const respuestas = await Promise.all(
        Array.from({ length: 10 }, (_, i) => crear({ identificacion: DOC(4), nombre: `Simultáneo ${i}` }))
    );
    assert.equal(respuestas.filter((r) => r.status === 201).length, 1);
    assert.equal(respuestas.filter((r) => r.status === 409).length, 9);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM clientes WHERE identificacion = $1', [DOC(4)]);
    assert.equal(rows[0].n, 1);
});

// --------------------------------- Consulta ---------------------------------

caso('Busca por inicio del documento, aunque se escriba con puntos (autocompletado POS)', async () => {
    const { status, body } = await api(`?q=${encodeURIComponent(`77.${SUFIJO}`)}&limit=50`);
    assert.equal(status, 200);
    const ids = body.data.map((c) => c.id_cliente);
    assert.ok(ids.includes(ref.ana) && ids.includes(ref.empresa));
});

caso('Busca por nombre sin importar mayúsculas y pagina', async () => {
    const { body } = await api('?q=MARÍA PÉREZ');
    assert.ok(body.data.some((c) => c.id_cliente === ref.ana));
    assert.equal(body.pagination.limit, 10);
    const literal = await api(`?q=${encodeURIComponent('%')}`);
    assert.equal(literal.body.pagination.total, 0);
});

caso('Rechaza parámetros de listado inválidos (400)', async () => {
    for (const q of ['?page=0', '?limit=101', '?estado=si']) {
        assert.equal((await api(q)).status, 400, q);
    }
});

caso('Consulta por documento exacto (CU-09 FA-1) y por id', async () => {
    const porDoc = await api(`/document/${encodeURIComponent(`77.${SUFIJO}.1`)}`);
    assert.equal(porDoc.status, 200);
    assert.equal(porDoc.body.id_cliente, ref.ana);
    assert.equal((await api('/document/99999999999')).status, 404);
    assert.equal((await api(`/${ref.ana}`)).body.identificacion, DOC(1));
    assert.equal((await api('/99999999')).status, 404);
    assert.equal((await api('/abc')).status, 400);
});

// --------------------------------- Edición ---------------------------------

caso('Edita los datos de contacto y permite vaciar los opcionales (CU-09 FA-1)', async () => {
    const { status, body } = await editar(ref.ana, { telefono: '+57 311 000 0000', direccion: '', nombre: 'Ana M. Pérez' });
    assert.equal(status, 200);
    assert.equal(body.cliente.telefono, '+57 311 000 0000');
    assert.equal(body.cliente.direccion, null);
    assert.equal(body.cliente.nombre, 'Ana M. Pérez');
    assert.equal(body.cliente.correo, 'ana.perez@correo.com');
});

caso('El documento es inalterable: API y base de datos lo rechazan (CU-09 RB-1)', async () => {
    assert.equal((await editar(ref.ana, { identificacion: DOC(9) })).status, 400);
    assert.equal((await editar(ref.ana, { tipo_identificacion: 'CE' })).status, 400);
    // Reenviar el mismo documento (formulario completo) sí se permite
    assert.equal((await editar(ref.ana, { identificacion: DOC(1), nombre: 'Ana M. Pérez' })).status, 200);
    await assert.rejects(
        pool.query('UPDATE clientes SET identificacion = $1 WHERE id_cliente = $2', [DOC(9), ref.ana]),
        (e) => e.code === 'SM008'
    );
});

caso('Valida la edición: cuerpo vacío, nombre vacío, estado no booleano, cliente inexistente', async () => {
    assert.equal((await editar(ref.ana, {})).status, 400);
    assert.equal((await editar(ref.ana, { nombre: '' })).status, 400);
    assert.equal((await editar(ref.ana, { estado: 'no' })).status, 400);
    assert.equal((await editar(99999999, { nombre: 'X' })).status, 404);
});

caso('Inactiva un cliente y el filtro por estado lo refleja', async () => {
    assert.equal((await editar(ref.empresa, { estado: false })).body.cliente.estado, false);
    const inactivos = await api(`?estado=false&q=${DOC(2)}`);
    assert.ok(inactivos.body.data.some((c) => c.id_cliente === ref.empresa));
    const activos = await api(`?estado=true&q=${DOC(2)}`);
    assert.ok(!activos.body.data.some((c) => c.id_cliente === ref.empresa));
});

// --------------------------------- Historial ---------------------------------

caso('Historial vacío para un cliente sin compras', async () => {
    const { status, body } = await api(`/${ref.empresa}/history`);
    assert.equal(status, 200);
    assert.equal(body.resumen.compras_completadas, 0);
    assert.equal(Number(body.resumen.total_comprado), 0);
    assert.deepEqual(body.compras, []);
    assert.deepEqual(body.pedidos, []);
});

caso('Historial con compras y pedidos: solo suma las ventas completadas (HU-009 criterio 2)', async () => {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query(
            `INSERT INTO ventas (id_cliente, id_usuario, id_metodo_pago, subtotal, total) VALUES ($1, $2, 1, 50000, 50000)`,
            [ref.ana, ref.vendedor]
        );
        await cliente.query(
            `INSERT INTO ventas (id_cliente, id_usuario, id_metodo_pago, subtotal, total, estado, anulada_en, anulada_por, autorizada_por, motivo_anulacion)
             VALUES ($1, $2, 2, 20000, 20000, 'ANULADA', now(), $2, $3, 'Prueba de historial')`,
            [ref.ana, ref.vendedor, ref.gerente]
        );
        await cliente.query("SELECT set_config('simo.id_usuario', $1, true)", [String(ref.vendedor)]);
        await cliente.query(
            `INSERT INTO pedidos (id_cliente, id_usuario, fecha_solicitud, fecha_entrega_pactada)
             VALUES ($1, $2, now() - interval '5 days', now() - interval '1 day')`,
            [ref.ana, ref.vendedor]
        );
        await cliente.query('COMMIT');
    } finally {
        cliente.release();
    }

    const { status, body } = await api(`/${ref.ana}/history`);
    assert.equal(status, 200);
    assert.equal(body.cliente.id_cliente, ref.ana);
    assert.equal(body.resumen.compras_completadas, 1);
    assert.equal(Number(body.resumen.total_comprado), 50000);
    assert.equal(body.resumen.pedidos_totales, 1);
    assert.equal(body.resumen.pedidos_abiertos, 1);
    assert.equal(body.compras.length, 2);
    assert.deepEqual(body.compras.map((v) => v.estado).sort(), ['ANULADA', 'COMPLETADA']);
    assert.equal(body.pedidos[0].estado, 'REGISTRADO');
    assert.equal(body.pedidos[0].vencido, true);
});

caso('Historial: valida limit y responde 404 si el cliente no existe', async () => {
    assert.equal((await api(`/${ref.ana}/history?limit=1`)).body.compras.length, 1);
    assert.equal((await api(`/${ref.ana}/history?limit=500`)).status, 400);
    assert.equal((await api('/99999999/history')).status, 404);
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
test('Gestión de clientes (HU-09)', async (t) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
