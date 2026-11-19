// tests/integracion/rendimiento.test.js
// Pruebas de integración de los cambios de rendimiento de SCRUM-168:
//   - GET /api/orders sin filtro: últimos 180 días más los pedidos abiertos.
//   - GET /api/dashboard/alerts: los 100 pedidos más atrasados y el total.
//   - GET /api/reports: responde sin generar los archivos.
//   - El índice idx_pedidos_fecha_solicitud (migración 024) existe y se usa.
// Requieren la base con migraciones y seed. Levantan index.js en un puerto aparte.
//
// Los pedidos y su historial son inalterables: cada ejecución crea su propio
// cliente (documento con marca de tiempo) y al terminar lo deja inactivo.
//
//   npm run test:integracion
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');

const PORT = process.env.TEST_PORT_RENDIMIENTO || 3992;
const API = `http://localhost:${PORT}/api`;
const SUFIJO = String(Date.now()).slice(-8);
let servidor;
const ref = {};
const t = {};
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

async function api(ruta, token = t.gerente) {
    const res = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
}

// Pedido con fecha de solicitud en el pasado, llevado al estado indicado por
// el ciclo real (fn_cambiar_estado_pedido). Sin líneas: no mueve stock.
async function pedidoAntiguo(diasAtras, estado) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query(`SELECT set_config('simo.id_usuario', $1, true)`, [String(ref.vendedor)]);
        const { rows } = await cliente.query(
            `INSERT INTO pedidos (id_cliente, id_usuario, fecha_solicitud, fecha_entrega_pactada)
             VALUES ($1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '2 days')
             RETURNING id_pedido`,
            [ref.cliente, ref.vendedor, diasAtras]
        );
        const id = rows[0].id_pedido;
        const ciclo = ['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO'];
        const pasos = estado === 'CANCELADO' ? ['CANCELADO'] : ciclo.slice(0, ciclo.indexOf(estado) + 1);
        for (const paso of pasos) {
            await cliente.query('SELECT fn_cambiar_estado_pedido($1, $2, $3, $4)', [id, paso, ref.vendedor, paso === 'CANCELADO' ? 'Prueba' : null]);
        }
        await cliente.query('COMMIT');
        return id;
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

async function preparar() {
    servidor = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), REPORTES_PRECALENTAR: 'false' },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
    t.gerente = await iniciarSesion(PORT, 'gerente@simo.local');
    t.inventario = await iniciarSesion(PORT, 'inventario@simo.local');
    ref.vendedor = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor'`)).rows[0].id_usuario;
    ref.cliente = (await pool.query(
        `INSERT INTO clientes (identificacion, nombre) VALUES ($1, $2) RETURNING id_cliente`,
        [`44${SUFIJO}1`, `Cliente rendimiento ${SUFIJO}`])).rows[0].id_cliente;
    ref.entregadoViejo = await pedidoAntiguo(400, 'ENTREGADO');
    ref.canceladoViejo = await pedidoAntiguo(300, 'CANCELADO');
    ref.abiertoViejo = await pedidoAntiguo(500, 'CONFIRMADO');
    ref.entregadoReciente = await pedidoAntiguo(20, 'ENTREGADO');
}

async function limpiar() {
    await pool.query(`UPDATE clientes SET estado = FALSE WHERE identificacion LIKE $1`, [`44${SUFIJO}%`]);
    await pool.end();
    servidor.kill();
}

caso('GET /api/orders sin filtro: últimos 180 días y todos los abiertos', async () => {
    const { status, body } = await api('/orders');
    assert.equal(status, 200);
    const ids = new Set(body.data.map((p) => p.id_pedido));
    assert.ok(ids.has(ref.entregadoReciente), 'el pedido reciente debe aparecer');
    assert.ok(ids.has(ref.abiertoViejo), 'un pedido abierto nunca se pierde, aunque sea antiguo');
    assert.ok(!ids.has(ref.entregadoViejo), 'un pedido cerrado de hace más de 180 días no se trae por defecto');
    assert.ok(!ids.has(ref.canceladoViejo));
    assert.ok(body.data.every((p, i) => i === 0 || new Date(p.fecha_solicitud) <= new Date(body.data[i - 1].fecha_solicitud)));
});

caso('GET /api/orders con rango o con cliente trae también los antiguos', async () => {
    const hace = (dias) => new Date(Date.now() - dias * 86400e3).toISOString().slice(0, 10);
    const conRango = await api(`/orders?desde=${hace(410)}&hasta=${hace(390)}`);
    assert.ok(conRango.body.data.some((p) => p.id_pedido === ref.entregadoViejo));
    const delCliente = (await api(`/orders?id_cliente=${ref.cliente}`)).body.data.map((p) => p.id_pedido);
    for (const id of [ref.entregadoViejo, ref.canceladoViejo, ref.abiertoViejo, ref.entregadoReciente]) {
        assert.ok(delCliente.includes(id), `falta el pedido ${id} en el historial del cliente`);
    }
});

caso('Alertas del Gerente: como máximo 100 pedidos vencidos, los más atrasados primero, y el total', async () => {
    const { status, body } = await api('/dashboard/alerts');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.pedidos_vencidos));
    assert.ok(body.pedidos_vencidos.length <= 100);
    assert.ok(body.total_pedidos_vencidos >= body.pedidos_vencidos.length);
    assert.ok(body.pedidos_vencidos.some((p) => p.id_pedido === ref.abiertoViejo), 'el pedido abierto de hace 500 días es de los más atrasados');
    assert.ok(body.pedidos_vencidos.every((p, i) => i === 0 || p.dias_vencido <= body.pedidos_vencidos[i - 1].dias_vencido));
    const comoInventario = await api('/dashboard/alerts', t.inventario);
    assert.equal(comoInventario.body.pedidos_vencidos, undefined);
    assert.equal(comoInventario.body.total_pedidos_vencidos, undefined);
});

caso('GET /api/reports responde sin generar archivos', async () => {
    const inicio = Date.now();
    const { status, body } = await api('/reports');
    assert.equal(status, 200);
    assert.ok(Date.now() - inicio < 1000, 'el catálogo debe responder en menos de 1 segundo');
    assert.ok(body.data.length >= 9);
    for (const r of body.data) {
        assert.ok(r.nombre_archivo && r.fecha_generacion, r.nombre);
        assert.ok(r.tamano_bytes === null || r.tamano_bytes > 0, r.nombre);
    }
});

caso('El índice de pedidos por fecha (024) existe y lo usa la consulta por rango', async () => {
    const { rows } = await pool.query(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'pedidos' AND indexname = 'idx_pedidos_fecha_solicitud'`);
    assert.equal(rows.length, 1);
    assert.match(rows[0].indexdef, /fecha_solicitud DESC, id_pedido DESC/);
    const cliente = await pool.connect();
    try {
        // Sin recorridos completos el planificador debe poder resolverla con el índice
        await cliente.query('BEGIN');
        await cliente.query('SET LOCAL enable_seqscan = off');
        const plan = await cliente.query(
            `EXPLAIN SELECT id_pedido FROM pedidos WHERE fecha_solicitud >= now() - interval '30 days'
             ORDER BY fecha_solicitud DESC, id_pedido DESC`);
        assert.match(plan.rows.map((r) => r['QUERY PLAN']).join('\n'), /idx_pedidos_fecha_solicitud/);
        await cliente.query('ROLLBACK');
    } finally {
        cliente.release();
    }
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
// (before/after de node:test solo existen desde 18.8).
test('Rendimiento de consultas (SCRUM-168)', async (t2) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t2.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
