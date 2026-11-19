// tests/integracion/kardex.test.js
// Pruebas de integración de la auditoría completa del Kardex (SCRUM-169):
// GET /api/inventory/kardex-audit y la tarea nocturna.
// Requieren la base con migraciones y seed. Levantan index.js en un puerto aparte.
//
// La detección de cada tipo de inconsistencia se prueba en
// db/tests/011_auditoria_kardex.sql, que corrompe datos dentro de una
// transacción que se revierte. Aquí no se corrompe nada a propósito: los
// movimientos son inalterables y dañarían para siempre la base de pruebas.
//
//   npm run test:integracion
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');
const { ejecutarAuditoriaKardex } = require('../../cron/auditarKardex');

const PORT = process.env.TEST_PORT_KARDEX || 3991;
const API = `http://localhost:${PORT}/api`;
const SUFIJO = String(Date.now()).slice(-8);
let servidor;
const ref = {};
const t = {};
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

async function api(ruta, { metodo = 'GET', cuerpo, token = t.gerente } = {}) {
    const res = await fetch(`${API}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    return { status: res.status, body: await res.json() };
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
    for (const rol of ['gerente', 'inventario', 'vendedor', 'admin']) t[rol] = await iniciarSesion(PORT, `${rol}@simo.local`);
    ref.cliente = (await pool.query(
        `INSERT INTO clientes (identificacion, nombre) VALUES ($1, $2) RETURNING id_cliente`,
        [`33${SUFIJO}1`, `Cliente kardex ${SUFIJO}`])).rows[0].id_cliente;
    const producto = await api('/products', {
        metodo: 'POST', token: t.inventario,
        cuerpo: { id_categoria: 1, id_unidad: 1, sku: `TEST-KAU-${SUFIJO}`, nombre: `Producto auditoría ${SUFIJO}`, precio_compra: 100, precio_venta: 250 },
    });
    ref.producto = producto.body.producto.id_producto;
}

async function limpiar() {
    await pool.query(`UPDATE productos SET estado = FALSE WHERE sku = $1`, [`TEST-KAU-${SUFIJO}`]);
    await pool.query(`UPDATE clientes SET estado = FALSE WHERE identificacion LIKE $1`, [`33${SUFIJO}%`]);
    await pool.end();
    servidor.kill();
}

// Observaciones de la auditoría que mencionan los documentos de esta ejecución
const observacionesPropias = (body) => body.documentos.filter((d) => d.id_producto === ref.producto);

caso('Las operaciones hechas por la API no generan observaciones en la auditoría', async () => {
    const enviar = (ruta, cuerpo, token = t.inventario) => api(ruta, { metodo: 'POST', cuerpo, token });
    assert.equal((await enviar('/inventory/entries', { id_producto: ref.producto, cantidad: 20 })).status, 201);
    assert.equal((await enviar('/inventory/transfers', { id_producto: ref.producto, cantidad: 5 })).status, 201);
    assert.equal((await enviar('/inventory/adjustments', { id_producto: ref.producto, tipo_movimiento: 'AJUSTE_NEGATIVO', ubicacion: 'BODEGA', cantidad: 1, motivo: 'Unidad dañada' })).status, 201);
    const venta = await enviar('/sales', { metodo_pago: 'EFECTIVO', detalles: [{ id_producto: ref.producto, cantidad: 6 }] }, t.vendedor);
    assert.equal(venta.status, 201);
    const anulada = await enviar('/sales', { metodo_pago: 'EFECTIVO', detalles: [{ id_producto: ref.producto, cantidad: 2 }] }, t.vendedor);
    assert.equal((await enviar(`/sales/${anulada.body.venta.id_venta}/cancel`, { motivo: 'Devolución del cliente' }, t.gerente)).status, 200);
    const pedido = await enviar('/orders', {
        id_cliente: ref.cliente, fecha_entrega_pactada: new Date(Date.now() + 2 * 86400e3).toISOString(),
        lineas: [{ id_producto: ref.producto, cantidad: 3 }],
    }, t.vendedor);
    const idPedido = pedido.body.pedido.id_pedido;
    for (const estado of ['CONFIRMADO', 'EN_PREPARACION']) {
        assert.equal((await api(`/orders/${idPedido}/status`, { metodo: 'PATCH', cuerpo: { estado }, token: t.vendedor })).status, 200);
    }
    assert.equal((await enviar(`/orders/${idPedido}/cancel`, { causa: 'El cliente desistió' }, t.vendedor)).status, 200);

    const { status, body } = await api('/inventory/kardex-audit');
    assert.equal(status, 200);
    assert.deepEqual(observacionesPropias(body), []);
    assert.ok(!body.productos_inconsistentes.some((p) => p.id_producto === ref.producto));
});

caso('GET /api/inventory/kardex-audit: resumen y listas con el formato documentado', async () => {
    const { body } = await api('/inventory/kardex-audit', { token: t.inventario });
    const r = body.resumen;
    for (const campo of ['consistente', 'productos_revisados', 'movimientos_revisados', 'productos_inconsistentes', 'documentos_inconsistentes', 'observaciones']) {
        assert.ok(r[campo] !== undefined, `falta ${campo}`);
    }
    assert.equal(typeof r.consistente, 'boolean');
    assert.ok(r.productos_revisados >= 1 && r.movimientos_revisados >= 1);
    assert.equal(r.productos_inconsistentes, body.productos_inconsistentes.length);
    assert.equal(r.consistente, r.productos_inconsistentes === 0 && r.observaciones === 0);
    assert.ok(Array.isArray(body.documentos) && body.documentos.length <= 500);
    for (const d of body.documentos) {
        for (const campo of ['documento', 'id_documento', 'problema']) assert.ok(d[campo] !== undefined, `falta ${campo}`);
    }
});

caso('La auditoría es de Inventario, Gerente y Administrador', async () => {
    assert.equal((await api('/inventory/kardex-audit', { token: t.admin })).status, 200);
    assert.equal((await api('/inventory/kardex-audit', { token: t.vendedor })).status, 403);
    assert.equal((await api('/inventory/kardex-audit', { token: null })).status, 401);
});

caso('La tarea nocturna ejecuta la misma auditoría y devuelve el resumen', async () => {
    const resumen = await ejecutarAuditoriaKardex();
    const { body } = await api('/inventory/kardex-audit');
    assert.equal(resumen.productos_revisados, body.resumen.productos_revisados);
    assert.equal(resumen.consistente, body.resumen.consistente);
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
// (before/after de node:test solo existen desde 18.8).
test('Auditoría del Kardex (SCRUM-169)', async (t2) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t2.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
