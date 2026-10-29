// tests/integracion/pedidos.test.js
// Pruebas de integración del registro y consulta de pedidos (SCRUM-81 / HU-10).
// Requieren la base con migraciones y seed, y DATABASE_URL o DB_* del .env.
// Levantan index.js en un puerto aparte.
//
// El historial de pedidos es inalterable, así que los pedidos no se borran:
// cada ejecución crea su propio cliente y productos (sufijo con marca de
// tiempo) y al terminar los deja inactivos.
//
//   npm run test:integracion
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');

const PORT = process.env.TEST_PORT_PEDIDOS || 3995;
const BASE = `http://localhost:${PORT}/api/orders`;
const SUFIJO = String(Date.now()).slice(-8);
let servidor;
const ref = {};
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

let token; // sesión del Vendedor (seed), quien registra los pedidos

async function api(ruta = '', { metodo = 'GET', cuerpo, tokenSesion = token } = {}) {
    const res = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(tokenSesion ? { Authorization: `Bearer ${tokenSesion}` } : {}) },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
    return { status: res.status, body: await res.json() };
}
const registrar = (cuerpo, tokenSesion) => api('', { metodo: 'POST', cuerpo, tokenSesion });
const cambiarEstado = (id, cuerpo, tokenSesion) => api(`/${id}/status`, { metodo: 'PATCH', cuerpo, tokenSesion });

async function stock(producto) {
    const { rows } = await pool.query(
        'SELECT stock_bodega::float AS bodega, stock_almacen::float AS almacen FROM productos WHERE id_producto = $1',
        [producto.id_producto]
    );
    return rows[0];
}

// Registra un pedido de un solo producto y devuelve su id
async function pedidoDe(producto, cantidad) {
    const { status, body } = await registrar({ ...pedidoValido(), lineas: [{ id_producto: producto.id_producto, cantidad }] });
    assert.equal(status, 201);
    return body.pedido.id_pedido;
}

// Fecha en Colombia (UTC-5), formato AAAA-MM-DD
const diaColombia = (desplazamientoDias = 0) =>
    new Date(Date.now() - 5 * 3600e3 + desplazamientoDias * 86400e3).toISOString().slice(0, 10);

async function crearProducto(sufijo, unidad, precioVenta, estado = true) {
    const { rows } = await pool.query(
        `INSERT INTO productos (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta, estado)
         SELECT (SELECT min(id_categoria) FROM categorias), u.id_unidad, $1, $2, 1000, $4, $5
         FROM unidades_medida u WHERE u.abreviatura = $3
         RETURNING id_producto, sku`,
        [`TEST-PED-${sufijo}-${SUFIJO}`, `Producto pedido ${sufijo}`, unidad, precioVenta, estado]
    );
    return rows[0];
}

async function preparar() {
    const cliente = await pool.query(
        `INSERT INTO clientes (identificacion, nombre, telefono) VALUES ($1, $2, '3001112233') RETURNING id_cliente`,
        [`66${SUFIJO}1`, `Cliente pedidos ${SUFIJO}`]
    );
    ref.cliente = cliente.rows[0].id_cliente;
    ref.clienteInactivo = (await pool.query(
        `INSERT INTO clientes (identificacion, nombre, estado) VALUES ($1, $2, FALSE) RETURNING id_cliente`,
        [`66${SUFIJO}2`, `Cliente inactivo ${SUFIJO}`]
    )).rows[0].id_cliente;
    ref.und = await crearProducto('U', 'und', 2500);
    ref.kg = await crearProducto('K', 'kg', 4000);
    ref.inactivo = await crearProducto('I', 'und', 2000, false);
    ref.stock = await crearProducto('S', 'und', 3000);       // SCRUM-61: Bodega 7, Almacén 3
    ref.disputado = await crearProducto('D', 'und', 1000);   // SCRUM-61: 10 en Bodega, para concurrencia
    const inventario = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'inventario'`)).rows[0].id_usuario;
    await pool.query('SELECT fn_registrar_ingreso_bodega($1, 10, $2)', [ref.stock.id_producto, inventario]);
    await pool.query('SELECT fn_registrar_ingreso_bodega($1, 10, $2)', [ref.disputado.id_producto, inventario]);
    await pool.query(
        `INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                             costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
         VALUES ($1, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 3, 1000, 7, 3, $2)`, [ref.stock.id_producto, inventario]);
    await pool.query('UPDATE productos SET stock_bodega = 7, stock_almacen = 3 WHERE id_producto = $1', [ref.stock.id_producto]);
    ref.vendedor = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor'`)).rows[0].id_usuario;

    servidor = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
    token = await iniciarSesion(PORT, 'vendedor@simo.local');
}

async function limpiar() {
    await pool.query(`UPDATE productos SET estado = FALSE WHERE sku LIKE $1`, [`TEST-PED-%-${SUFIJO}`]);
    await pool.query(`UPDATE clientes SET estado = FALSE WHERE identificacion LIKE $1`, [`66${SUFIJO}%`]);
    await pool.end();
    servidor.kill();
}

const pedidoValido = () => ({
    id_cliente: ref.cliente,
    fecha_entrega_pactada: diaColombia(3),
    direccion_entrega: 'Calle 10 # 5-20, Cúcuta',
    observaciones: 'Entregar en la mañana',
    lineas: [{ id_producto: ref.und.id_producto, cantidad: 3 }, { sku: ref.kg.sku, cantidad: '1.25' }],
});

// --------------------------------- Registro ---------------------------------

caso('Registra el pedido en REGISTRADO con precios vigentes, total e historial', async () => {
    const { status, body } = await registrar(pedidoValido());
    assert.equal(status, 201);
    const p = body.pedido;
    ref.pedido = p.id_pedido;
    assert.equal(p.estado, 'REGISTRADO');
    assert.equal(p.id_cliente, ref.cliente);
    assert.equal(p.id_usuario, ref.vendedor);
    assert.equal(p.nombre_usuario, 'Vendedor SIMO');
    assert.equal(p.direccion_entrega, 'Calle 10 # 5-20, Cúcuta');
    assert.equal(p.lineas.length, 2);
    assert.equal(Number(p.lineas[0].precio_unitario), 2500);
    assert.equal(Number(p.lineas[1].subtotal_linea), 5000);
    assert.equal(Number(p.total), 3 * 2500 + 1.25 * 4000);
    assert.equal(p.vencido, false);
    assert.deepEqual(p.historial.map((h) => [h.estado_anterior, h.estado_nuevo, h.id_usuario]), [[null, 'REGISTRADO', ref.vendedor]]);
});

caso('Una fecha sin hora se pacta para el final de ese día en hora de Colombia', async () => {
    const { body } = await api(`/${ref.pedido}`);
    assert.equal(new Date(body.pedido.fecha_entrega_pactada).toISOString(), new Date(`${diaColombia(3)}T23:59:59.999-05:00`).toISOString());
});

caso('Registrar no descuenta stock; avisa si hoy no alcanza', async () => {
    const { rows } = await pool.query('SELECT stock_total::float AS s FROM productos WHERE id_producto = $1', [ref.und.id_producto]);
    assert.equal(rows[0].s, 0);
    const { body } = await registrar({ ...pedidoValido(), lineas: [{ id_producto: ref.und.id_producto, cantidad: 1 }] });
    assert.match(body.advertencia, /no alcanza el stock/);
    assert.equal(body.pedido.lineas[0].disponible, false);
});

caso('Ignora un precio enviado por el cliente: usa el precio de venta del producto', async () => {
    const { status, body } = await registrar({
        ...pedidoValido(), lineas: [{ id_producto: ref.und.id_producto, cantidad: 2, precio_unitario: 1 }],
    });
    assert.equal(status, 201);
    assert.equal(Number(body.pedido.total), 5000);
});

caso('Valida cliente, fecha, textos y líneas (400)', async () => {
    const base = pedidoValido();
    const malos = [
        { id_cliente: undefined }, { id_cliente: 'x' },
        { fecha_entrega_pactada: undefined }, { fecha_entrega_pactada: 'mañana' }, { fecha_entrega_pactada: '2026-02-30' },
        { fecha_entrega_pactada: diaColombia(-1) },
        { direccion_entrega: 'x'.repeat(201) }, { observaciones: 5 },
        { lineas: [] }, { lineas: 'x' },
        { lineas: [{ id_producto: ref.und.id_producto, cantidad: 0 }] },
        { lineas: [{ id_producto: ref.und.id_producto, cantidad: 1.2345 }] },
        { lineas: [{ cantidad: 1 }] },
        { lineas: [{ id_producto: ref.und.id_producto, cantidad: 1 }, { id_producto: ref.und.id_producto, cantidad: 2 }] },
        { lineas: [{ id_producto: ref.und.id_producto, cantidad: 1.5 }] }, // producto por unidad (regla de la base, 015)
    ];
    for (const cambio of malos) {
        const r = await registrar({ ...base, ...cambio });
        assert.equal(r.status, 400, JSON.stringify(cambio));
        assert.ok(r.body.message);
    }
});

caso('404 si el cliente o un producto no existen; 409 si están inactivos', async () => {
    assert.equal((await registrar({ ...pedidoValido(), id_cliente: 99999999 })).status, 404);
    assert.equal((await registrar({ ...pedidoValido(), lineas: [{ id_producto: 99999999, cantidad: 1 }] })).status, 404);
    assert.equal((await registrar({ ...pedidoValido(), lineas: [{ sku: 'NO-EXISTE-XYZ', cantidad: 1 }] })).status, 404);
    assert.equal((await registrar({ ...pedidoValido(), id_cliente: ref.clienteInactivo })).status, 409);
    assert.equal((await registrar({ ...pedidoValido(), lineas: [{ id_producto: ref.inactivo.id_producto, cantidad: 1 }] })).status, 409);
});

caso('Un pedido rechazado no deja nada a medias', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM pedidos WHERE id_cliente = $1', [ref.cliente])).rows[0].n;
    await registrar({ ...pedidoValido(), lineas: [{ id_producto: ref.und.id_producto, cantidad: 1 }, { id_producto: ref.inactivo.id_producto, cantidad: 1 }] });
    const despues = (await pool.query('SELECT count(*)::int AS n FROM pedidos WHERE id_cliente = $1', [ref.cliente])).rows[0].n;
    assert.equal(despues, antes);
});

// --------------------------------- Consulta ---------------------------------

caso('GET /api/orders con el contrato del frontend (SCRUM-125) y filtros', async () => {
    const { status, body } = await api(`?id_cliente=${ref.cliente}`);
    assert.equal(status, 200);
    assert.equal(body.data.length, 3);
    for (const campo of ['id_pedido', 'nombre_cliente', 'nombre_usuario', 'estado', 'fecha_solicitud', 'fecha_entrega_pactada', 'total']) {
        assert.ok(body.data[0][campo] !== undefined, `falta ${campo}`);
    }
    assert.ok(body.data.every((p, i) => i === 0 || new Date(p.fecha_solicitud) <= new Date(body.data[i - 1].fecha_solicitud)));
    const hoy = diaColombia();
    assert.equal((await api(`?id_cliente=${ref.cliente}&desde=${hoy}&hasta=${hoy}`)).body.data.length, 3);
    assert.equal((await api(`?id_cliente=${ref.cliente}&desde=${diaColombia(1)}`)).body.data.length, 0);
    assert.equal((await api(`?id_cliente=${ref.cliente}&estado=registrado`)).body.data.length, 3);
    assert.equal((await api(`?id_cliente=${ref.cliente}&estado=ENTREGADO`)).body.data.length, 0);
    for (const q of ['?estado=PERDIDO', '?desde=ayer', '?id_cliente=x', `?desde=${diaColombia(1)}&hasta=${hoy}`]) {
        assert.equal((await api(q)).status, 400, q);
    }
});

caso('GET /api/orders/:id: 404 si no existe y 400 si el id es inválido', async () => {
    assert.equal((await api('/99999999')).status, 404);
    assert.equal((await api('/abc')).status, 400);
});

caso('Roles: registra Vendedor/Gerente/Admin; Inventario consulta pero no registra', async () => {
    assert.equal((await registrar(pedidoValido(), null)).status, 401);
    const inventario = await iniciarSesion(PORT, 'inventario@simo.local');
    assert.equal((await registrar(pedidoValido(), inventario)).status, 403);
    assert.equal((await api(`/${ref.pedido}`, { tokenSesion: inventario })).status, 200);
    const gerente = await iniciarSesion(PORT, 'gerente@simo.local');
    assert.equal((await registrar({ ...pedidoValido(), lineas: [{ id_producto: ref.kg.id_producto, cantidad: 2 }] }, gerente)).status, 201);
});

// ------------------------------ Cambio de estado (SCRUM-61) ------------------------------

caso('Ciclo completo con el contrato del frontend: descuenta stock solo al pasar a EN_PREPARACION', async () => {
    const id = await pedidoDe(ref.stock, 5);
    const inventario = await iniciarSesion(PORT, 'inventario@simo.local');

    const confirmado = await cambiarEstado(id, { estado: 'CONFIRMADO' });
    assert.equal(confirmado.status, 200);
    assert.equal(confirmado.body.estado, 'CONFIRMADO');           // el front lee data.estado
    assert.deepEqual(await stock(ref.stock), { bodega: 7, almacen: 3 });

    const preparado = await cambiarEstado(id, { estado: 'en_preparacion' }, inventario);
    assert.equal(preparado.status, 200);
    assert.equal(preparado.body.estado, 'EN_PREPARACION');
    assert.deepEqual(await stock(ref.stock), { bodega: 5, almacen: 0 }); // 3 del Almacén y 2 de Bodega

    for (const estado of ['LISTO', 'ENTREGADO']) {
        assert.equal((await cambiarEstado(id, { estado }, inventario)).status, 200);
    }
    assert.deepEqual(await stock(ref.stock), { bodega: 5, almacen: 0 });
    const { body } = await api(`/${id}`);
    assert.deepEqual(body.pedido.historial.map((h) => h.estado_nuevo), ['REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']);
    assert.equal(body.pedido.historial[2].nombre_usuario, 'Encargado Inventario');

    const { rows } = await pool.query(
        `SELECT ubicacion_origen, cantidad::float FROM movimientos_inventario
         WHERE id_pedido = $1 AND tipo_movimiento = 'SALIDA_PEDIDO' ORDER BY id_movimiento`, [id]);
    assert.deepEqual(rows, [{ ubicacion_origen: 'ALMACEN', cantidad: 3 }, { ubicacion_origen: 'BODEGA', cantidad: 2 }]);
    ref.entregado = id;
});

caso('Transiciones inválidas (409) y datos inválidos (400/404)', async () => {
    const id = await pedidoDe(ref.kg, 1);
    assert.equal((await cambiarEstado(id, { estado: 'LISTO' })).status, 409);        // salta estados
    assert.equal((await cambiarEstado(ref.entregado, { estado: 'CONFIRMADO' })).status, 409);
    assert.equal((await cambiarEstado(ref.entregado, { estado: 'CANCELADO', motivo: 'tarde' })).status, 409);
    for (const cuerpo of [{}, { estado: 'PERDIDO' }, { estado: 'REGISTRADO' }, { estado: 5 }, { estado: 'CONFIRMADO', motivo: 7 }]) {
        assert.equal((await cambiarEstado(id, cuerpo)).status, 400, JSON.stringify(cuerpo));
    }
    assert.equal((await cambiarEstado(99999999, { estado: 'CONFIRMADO' })).status, 404);
    assert.equal((await api('/abc/status', { metodo: 'PATCH', cuerpo: { estado: 'CONFIRMADO' } })).status, 400);
    const r = await cambiarEstado(id, { estado: 'LISTO' });
    assert.match(r.body.message, /secuencial/);
});

caso('Cancelar exige motivo y devuelve el stock a su ubicación', async () => {
    const id = await pedidoDe(ref.stock, 4);
    await cambiarEstado(id, { estado: 'CONFIRMADO' });
    assert.equal((await cambiarEstado(id, { estado: 'EN_PREPARACION' })).status, 200);
    assert.deepEqual(await stock(ref.stock), { bodega: 1, almacen: 0 });

    const sinMotivo = await cambiarEstado(id, { estado: 'CANCELADO' });
    assert.equal(sinMotivo.status, 400);
    assert.match(sinMotivo.body.message, /motivo/);
    const cancelado = await cambiarEstado(id, { estado: 'CANCELADO', motivo: 'El cliente desistió' });
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.body.estado, 'CANCELADO');
    assert.deepEqual(await stock(ref.stock), { bodega: 5, almacen: 0 });
    const { body } = await api(`/${id}`);
    assert.equal(body.pedido.historial.at(-1).motivo, 'El cliente desistió');
    const { rows } = await pool.query('SELECT consistente FROM fn_validar_kardex($1)', [ref.stock.id_producto]);
    assert.equal(rows[0].consistente, true);
});

caso('Sin stock suficiente responde 409 y el pedido no avanza', async () => {
    const id = await pedidoDe(ref.stock, 6);   // hay 5
    await cambiarEstado(id, { estado: 'CONFIRMADO' });
    const r = await cambiarEstado(id, { estado: 'EN_PREPARACION' });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Stock insuficiente/);
    assert.equal((await api(`/${id}`)).body.pedido.estado, 'CONFIRMADO');
    assert.deepEqual(await stock(ref.stock), { bodega: 5, almacen: 0 });
});

caso('Dos pedidos que se preparan a la vez por el mismo stock: solo uno lo obtiene', async () => {
    const a = await pedidoDe(ref.disputado, 6);
    const b = await pedidoDe(ref.disputado, 6);    // hay 10: no alcanzan los dos
    await cambiarEstado(a, { estado: 'CONFIRMADO' });
    await cambiarEstado(b, { estado: 'CONFIRMADO' });
    const respuestas = await Promise.all([a, b].map((id) => cambiarEstado(id, { estado: 'EN_PREPARACION' })));
    assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 409]);
    assert.deepEqual(await stock(ref.disputado), { bodega: 4, almacen: 0 });
    const { rows } = await pool.query('SELECT consistente FROM fn_validar_kardex($1)', [ref.disputado.id_producto]);
    assert.equal(rows[0].consistente, true);
});

caso('Cambio de estado: exige sesión; /estado es alias', async () => {
    const id = await pedidoDe(ref.kg, 1);
    assert.equal((await cambiarEstado(id, { estado: 'CONFIRMADO' }, null)).status, 401);
    assert.equal((await api(`/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado: 'CONFIRMADO' } })).status, 200);
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
// (before/after de node:test solo existen desde 18.8).
test('Pedidos (SCRUM-81 / HU-10)', async (t) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
