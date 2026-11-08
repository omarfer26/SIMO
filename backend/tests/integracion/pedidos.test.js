// tests/integracion/pedidos.test.js
// Pruebas de integración del ciclo secuencial de pedidos y la reserva de
// stock en preparación (HU-10 / CU-12 / CU-13).
// Requieren la base creada con db/00_init.sh (migraciones + seed) y las
// variables DB_* (o DATABASE_URL) del .env. Levantan index.js en un puerto aparte.
//
// Los productos y el cliente de prueba se crean con marca de tiempo propia y
// al terminar quedan inactivos. Los pedidos, sus movimientos de inventario y
// el historial NO se borran: son inalterables por diseño (RF-18, RN-04).
//
//   npm run test:integracion
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');

const PORT = process.env.TEST_PORT_PEDIDOS || 3998;
const BASE = `http://localhost:${PORT}/api`;
const SUFIJO = String(Date.now()).slice(-8);
const SKU_A = `HU10-A-${SUFIJO}`;
const SKU_B = `HU10-B-${SUFIJO}`;
const DOC = `88${SUFIJO}`;
const DOC_INACTIVO = `89${SUFIJO}`;
const MOTIVO = 'El cliente desistió de la compra';
let servidor;
const ref = {};
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

let token; // Vendedor: actor principal de HU-10
let tokenInventario; // Consulta pedidos, no los gestiona

// Día de hoy en Colombia, en formato AAAA-MM-DD (el backend rechaza el pasado).
function hoyEnColombia() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

async function api(ruta = '', opciones = {}, usarToken = token) {
    const res = await fetch(`${BASE}${ruta}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usarToken}` },
        ...opciones,
    });
    return { status: res.status, body: await res.json() };
}

const crearPedido = (cuerpo) => api('/orders', { method: 'POST', body: JSON.stringify(cuerpo) });
const cambiarEstado = (id, estado, motivo) =>
    api(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(motivo === undefined ? { estado } : { estado, motivo }),
    });

function pedidoValido(lineas) {
    return {
        id_cliente: ref.cliente,
        fecha_entrega_pactada: hoyEnColombia(),
        direccion_entrega: 'Calle 10 # 5-20',
        observaciones: 'Prueba de integración HU-10',
        lineas,
    };
}

async function stockDe(idProducto) {
    const { rows } = await pool.query(
        `SELECT stock_bodega, stock_almacen, stock_total FROM productos WHERE id_producto = $1`,
        [idProducto]
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
    ref.cancelar = await crearProducto('C', 'und', 2000);    // SCRUM-100: Bodega 7, Almacén 3 (escenario CA-1)
    const inventario = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'inventario'`)).rows[0].id_usuario;
    await pool.query('SELECT fn_registrar_ingreso_bodega($1, 10, $2)', [ref.stock.id_producto, inventario]);
    await pool.query('SELECT fn_registrar_ingreso_bodega($1, 10, $2)', [ref.disputado.id_producto, inventario]);
    await pool.query(
        `INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                             costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
         VALUES ($1, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 3, 1000, 7, 3, $2)`, [ref.stock.id_producto, inventario]);
    await pool.query('UPDATE productos SET stock_bodega = 7, stock_almacen = 3 WHERE id_producto = $1', [ref.stock.id_producto]);
    await pool.query('SELECT fn_registrar_ingreso_bodega($1, 10, $2)', [ref.cancelar.id_producto, inventario]);
    await pool.query(
        `INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                             costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
         VALUES ($1, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', 3, 1000, 7, 3, $2)`, [ref.cancelar.id_producto, inventario]);
    await pool.query('UPDATE productos SET stock_bodega = 7, stock_almacen = 3 WHERE id_producto = $1', [ref.cancelar.id_producto]);
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
    tokenInventario = await iniciarSesion(PORT, 'inventario@simo.local');

    // --- Productos de prueba ---
    // A queda con stock solo en Bodega (entra por la función oficial de HU-05)
    // y B con stock solo en Almacén (atajo de la prueba) para ver la cascada.
    const crearProducto = async (sku, nombre, precioVenta) => {
        const { rows } = await pool.query(
            `INSERT INTO productos (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
             VALUES ((SELECT min(id_categoria) FROM categorias),
                     (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
                     $1, $2, 1000, $3)
             RETURNING id_producto`,
            [sku, nombre, precioVenta]
        );
        return rows[0].id_producto;
    };
    ref.productoA = await crearProducto(SKU_A, 'Producto HU-10 A', 12000);
    ref.productoB = await crearProducto(SKU_B, 'Producto HU-10 B', 8000);

    await pool.query(`SELECT * FROM fn_registrar_ingreso_bodega($1, 10, $2, NULL, NULL, NULL, 'Prueba HU-10')`, [
        ref.productoA,
        ref.vendedor,
    ]);
    await pool.query(`UPDATE productos SET stock_almacen = 5 WHERE id_producto = $1`, [ref.productoB]);

    // --- Cliente activo e inactivo ---
    const cliente = await api('/customers', {
        method: 'POST',
        body: JSON.stringify({ identificacion: DOC, nombre: 'Cliente HU-10' }),
    });
    assert.equal(cliente.status, 201, 'no se pudo crear el cliente de prueba');
    ref.cliente = cliente.body.cliente.id_cliente;

    const inactivo = await api('/customers', {
        method: 'POST',
        body: JSON.stringify({ identificacion: DOC_INACTIVO, nombre: 'Cliente HU-10 Inactivo' }),
    });
    ref.clienteInactivo = inactivo.body.cliente.id_cliente;
    await api(`/customers/${ref.clienteInactivo}`, { method: 'PUT', body: JSON.stringify({ estado: false }) });
}

async function limpiar() {
    await pool.query(`UPDATE productos SET estado = FALSE WHERE sku IN ($1, $2)`, [SKU_A, SKU_B]);
    await pool.query(`UPDATE clientes SET estado = FALSE WHERE identificacion IN ($1, $2)`, [DOC, DOC_INACTIVO]);
    await pool.end();
    servidor.kill();
}

// ------------------------------- Registro -------------------------------

caso('Registra un pedido: nace REGISTRADO y el total lo calcula la base (CU-12)', async () => {
    const { status, body } = await crearPedido(
        pedidoValido([
            { id_producto: ref.productoA, cantidad: 2 },
            { id_producto: ref.productoB, cantidad: 1 },
        ])
    );
    assert.equal(status, 201);
    assert.equal(body.pedido.estado, 'REGISTRADO');
    assert.equal(body.pedido.stock_reservado, false);
    assert.equal(Number(body.pedido.total), 2 * 12000 + 8000);
    assert.equal(body.pedido.nombre_cliente, 'Cliente HU-10');
    assert.equal(body.pedido.nombre_usuario, 'Vendedor SIMO');
    assert.equal(body.pedido.id_venta, null);
    assert.equal(body.advertencia, null);
    ref.pedido1 = body.pedido.id_pedido;
});

caso('Avisa (sin bloquear) cuando hoy no alcanza el stock', async () => {
    const { status, body } = await crearPedido(pedidoValido([{ id_producto: ref.productoA, cantidad: 999 }]));
    assert.equal(status, 201);
    assert.ok(body.advertencia && body.advertencia.includes('no alcanza el stock'), body.advertencia);
    ref.pedidoSinStock = body.pedido.id_pedido;
});

caso('Valida los datos del pedido (400 / 404 / 409)', async () => {
    const sinLineas = await crearPedido({ ...pedidoValido([]) });
    assert.equal(sinLineas.status, 400);

    const fechaPasada = await crearPedido({
        ...pedidoValido([{ id_producto: ref.productoA, cantidad: 1 }]),
        fecha_entrega_pactada: '2000-01-01',
    });
    assert.equal(fechaPasada.status, 400);

    const fechaInvalida = await crearPedido({
        ...pedidoValido([{ id_producto: ref.productoA, cantidad: 1 }]),
        fecha_entrega_pactada: '2026-02-31',
    });
    assert.equal(fechaInvalida.status, 400);

    const cantidadCero = await crearPedido(pedidoValido([{ id_producto: ref.productoA, cantidad: 0 }]));
    assert.equal(cantidadCero.status, 400);

    const repetido = await crearPedido(
        pedidoValido([
            { id_producto: ref.productoA, cantidad: 1 },
            { id_producto: ref.productoA, cantidad: 2 },
        ])
    );
    assert.equal(repetido.status, 400);

    const clienteInexistente = await crearPedido({
        ...pedidoValido([{ id_producto: ref.productoA, cantidad: 1 }]),
        id_cliente: 99999999,
    });
    assert.equal(clienteInexistente.status, 404);

    const productoInexistente = await crearPedido(pedidoValido([{ id_producto: 99999999, cantidad: 1 }]));
    assert.equal(productoInexistente.status, 404);

    const clienteInactivo = await crearPedido({
        ...pedidoValido([{ id_producto: ref.productoA, cantidad: 1 }]),
        id_cliente: ref.clienteInactivo,
    });
    assert.equal(clienteInactivo.status, 409);
});

// --------------------------- Ciclo secuencial ---------------------------

caso('No permite saltar de REGISTRADO a EN_PREPARACION (CU-12 CA-2)', async () => {
    const salto = await cambiarEstado(ref.pedido1, 'EN_PREPARACION');
    assert.equal(salto.status, 409);

    const { body } = await api(`/orders/${ref.pedido1}`);
    assert.equal(body.pedido.estado, 'REGISTRADO');

    const stock = await stockDe(ref.productoA);
    assert.equal(Number(stock.stock_bodega), 10, 'el stock no debió moverse si el cambio fue rechazado');
});

caso('No acepta estados inventados ni volver a REGISTRADO', async () => {
    assert.equal((await cambiarEstado(ref.pedido1, 'EN_CAMINO')).status, 400);
    assert.equal((await cambiarEstado(ref.pedido1, 'REGISTRADO')).status, 400);
    assert.equal((await api('/orders/99999999/status', { method: 'PATCH', body: JSON.stringify({ estado: 'CONFIRMADO' }) })).status, 404);
    assert.equal((await api('/orders/abc/status', { method: 'PATCH', body: JSON.stringify({ estado: 'CONFIRMADO' }) })).status, 400);
});

caso('Avanza un paso a la vez: CONFIRMADO -> EN_PREPARACION reserva el stock (HU-10)', async () => {
    const confirmado = await cambiarEstado(ref.pedido1, 'CONFIRMADO');
    assert.equal(confirmado.status, 200);
    assert.equal(confirmado.body.pedido.estado, 'CONFIRMADO');
    assert.equal(confirmado.body.pedido.stock_reservado, false);

    const preparacion = await cambiarEstado(ref.pedido1, 'EN_PREPARACION');
    assert.equal(preparacion.status, 200);
    assert.equal(preparacion.body.pedido.estado, 'EN_PREPARACION');
    assert.equal(preparacion.body.pedido.stock_reservado, true);

    // Cascada: A sale de Bodega y B de Almacén.
    const stockA = await stockDe(ref.productoA);
    const stockB = await stockDe(ref.productoB);
    assert.equal(Number(stockA.stock_bodega), 8);
    assert.equal(Number(stockB.stock_almacen), 4);

    const salidas = (await movimientosDe(ref.pedido1)).filter((m) => m.tipo_movimiento === 'SALIDA_PEDIDO');
    assert.equal(salidas.length, 2);
    assert.deepEqual(salidas.map((m) => m.ubicacion_origen).sort(), ['ALMACEN', 'BODEGA']);
});

caso('No retrocede de EN_PREPARACION a CONFIRMADO', async () => {
    assert.equal((await cambiarEstado(ref.pedido1, 'CONFIRMADO')).status, 409);
    const { body } = await api(`/orders/${ref.pedido1}`);
    assert.equal(body.pedido.estado, 'EN_PREPARACION');
});

caso('Completa el ciclo hasta ENTREGADO y ya no admite cambios', async () => {
    assert.equal((await cambiarEstado(ref.pedido1, 'LISTO')).status, 200);
    const entregado = await cambiarEstado(ref.pedido1, 'ENTREGADO');
    assert.equal(entregado.status, 200);
    assert.equal(entregado.body.pedido.estado, 'ENTREGADO');

    assert.equal((await cambiarEstado(ref.pedido1, 'CANCELADO', MOTIVO)).status, 409);
    assert.equal((await cambiarEstado(ref.pedido1, 'LISTO')).status, 409);
});

caso('El historial guarda cada cambio con su usuario (RF-18)', async () => {
    const { rows } = await pool.query(
        `SELECT estado_anterior, estado_nuevo, id_usuario
         FROM historial_estados_pedido WHERE id_pedido = $1 ORDER BY id_historial`,
        [ref.pedido1]
    );
    assert.deepEqual(
        rows.map((r) => r.estado_nuevo),
        ['REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']
    );
    assert.ok(rows.every((r) => r.id_usuario === ref.vendedor));
});

// ------------------------------ Cancelación ------------------------------

caso('Cancelar exige motivo y devuelve el stock reservado (CU-13)', async () => {
    const creado = await crearPedido(pedidoValido([{ id_producto: ref.productoA, cantidad: 2 }]));
    const id = creado.body.pedido.id_pedido;
    ref.pedido2 = id;

    assert.equal((await cambiarEstado(id, 'CONFIRMADO')).status, 200);
    assert.equal((await cambiarEstado(id, 'EN_PREPARACION')).status, 200);
    assert.equal(Number((await stockDe(ref.productoA)).stock_bodega), 8 - 2);

    // CU-13 EX-2: sin motivo no se cancela.
    assert.equal((await cambiarEstado(id, 'CANCELADO')).status, 400);
    assert.equal((await cambiarEstado(id, 'CANCELADO', '   ')).status, 400);

    const cancelado = await cambiarEstado(id, 'CANCELADO', MOTIVO);
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.body.pedido.estado, 'CANCELADO');
    assert.equal(cancelado.body.pedido.stock_reservado, false);

    // El stock vuelve a la ubicación de origen.
    assert.equal(Number((await stockDe(ref.productoA)).stock_bodega), 8);
    const reversos = (await movimientosDe(id)).filter((m) => m.tipo_movimiento === 'REVERSO_PEDIDO');
    assert.equal(reversos.length, 1);
    assert.equal(reversos[0].ubicacion_destino, 'BODEGA');

    // El motivo queda en el historial y en la auditoría inalterable (HU-15).
    const { rows: historial } = await pool.query(
        `SELECT motivo FROM historial_estados_pedido WHERE id_pedido = $1 AND estado_nuevo = 'CANCELADO'`,
        [id]
    );
    assert.equal(historial[0].motivo, MOTIVO);

    const { rows: auditoria } = await pool.query(
        `SELECT accion, justificacion FROM log_auditoria WHERE entidad = 'pedidos' AND id_entidad = $1`,
        [id]
    );
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0].accion, 'CANCELACION_PEDIDO');
    assert.equal(auditoria[0].justificacion, MOTIVO);
});

caso('Cancelar antes de preparar no mueve stock ni genera reverso', async () => {
    const creado = await crearPedido(pedidoValido([{ id_producto: ref.productoA, cantidad: 1 }]));
    const id = creado.body.pedido.id_pedido;
    assert.equal((await cambiarEstado(id, 'CANCELADO', MOTIVO)).status, 200);
    assert.equal((await movimientosDe(id)).length, 0);
});

caso('Si el stock no alcanza, rechaza la reserva y deja el pedido en CONFIRMADO', async () => {
    assert.equal((await cambiarEstado(ref.pedidoSinStock, 'CONFIRMADO')).status, 200);

    const intento = await cambiarEstado(ref.pedidoSinStock, 'EN_PREPARACION');
    assert.equal(intento.status, 409);
    assert.match(intento.body.message, /Stock insuficiente/);

    const { body } = await api(`/orders/${ref.pedidoSinStock}`);
    assert.equal(body.pedido.estado, 'CONFIRMADO');
    assert.equal(Number((await stockDe(ref.productoA)).stock_bodega), 8);
});

// -------------------------------- Roles ---------------------------------

caso('Inventario consulta pedidos pero no los gestiona (403)', async () => {
    const lista = await api('/orders', {}, tokenInventario);
    assert.equal(lista.status, 200);
    assert.ok(lista.body.data.some((p) => p.id_pedido === ref.pedido1));

    const cambio = await api(
        `/orders/${ref.pedidoSinStock}/status`,
        { method: 'PATCH', body: JSON.stringify({ estado: 'EN_PREPARACION' }) },
        tokenInventario
    );
    assert.equal(cambio.status, 403);

    const registro = await api(
        '/orders',
        { method: 'POST', body: JSON.stringify(pedidoValido([{ id_producto: ref.productoA, cantidad: 1 }])) },
        tokenInventario
    );
    assert.equal(registro.status, 403);
});

// ------------------------------- Consulta -------------------------------

caso('Lista los pedidos y filtra por el día de Colombia', async () => {
    const { status, body } = await api('/orders');
    assert.equal(status, 200);
    const fila = body.data.find((p) => p.id_pedido === ref.pedido1);
    assert.ok(fila);
    assert.equal(fila.nombre_cliente, 'Cliente HU-10');
    assert.equal(fila.estado, 'ENTREGADO');
    assert.equal(fila.stock_reservado, true);

    const hoy = hoyEnColombia();
    const delDia = await api(`/orders?desde=${hoy}&hasta=${hoy}`);
    assert.equal(delDia.status, 200);
    assert.ok(delDia.body.data.some((p) => p.id_pedido === ref.pedido1));

    assert.equal((await api('/orders?desde=2026-02-31')).status, 400);
    assert.equal((await api(`/orders?desde=${hoy}&hasta=2000-01-01`)).status, 400);
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
test('Ciclo secuencial y reserva de pedidos (HU-10)', async (t) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
