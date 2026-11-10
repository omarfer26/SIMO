// tests/integracion/ventas.test.js
// Pruebas de integración de: catálogo protegido, traslados (HU-06), venta POS
// (HU-07), anulación (CU-11), pagos digitales (SCRUM-78), dashboard y alertas
// (SCRUM-67/68), reportes (SCRUM-76) y auditoría (HU-15).
// Requieren la base con migraciones y seed. Levantan index.js en un puerto aparte.
//
// Kardex, ventas y auditoría son inalterables: cada ejecución crea sus propios
// productos (sufijo con marca de tiempo) y al terminar los deja inactivos.
//
//   npm run test:integracion
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');

const PORT = process.env.TEST_PORT_VENTAS || 3994;
const API = `http://localhost:${PORT}/api`;
const SUFIJO = String(Date.now()).slice(-8);
let servidor;
const ref = {};
const t = {}; // tokens por rol
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

async function api(ruta, { metodo = 'GET', cuerpo, token = t.vendedor, cabeceras = {}, crudo = false } = {}) {
    const esBinario = Buffer.isBuffer(cuerpo);
    const res = await fetch(`${API}${ruta}`, {
        method: metodo,
        headers: {
            ...(esBinario ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...cabeceras,
        },
        ...(cuerpo !== undefined ? { body: esBinario ? cuerpo : JSON.stringify(cuerpo) } : {}),
    });
    if (crudo) return { status: res.status, headers: res.headers, datos: Buffer.from(await res.arrayBuffer()) };
    return { status: res.status, body: await res.json() };
}

async function stock(idProducto) {
    const { rows } = await pool.query(
        'SELECT stock_bodega::float AS bodega, stock_almacen::float AS almacen FROM productos WHERE id_producto = $1', [idProducto]);
    return rows[0];
}
const kardexOk = async (id) => (await pool.query('SELECT consistente FROM fn_validar_kardex($1)', [id])).rows[0].consistente;

async function preparar() {
    servidor = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
    for (const rol of ['admin', 'gerente', 'inventario', 'vendedor']) {
        t[rol] = await iniciarSesion(PORT, `${rol}@simo.local`);
    }
    for (const rol of ['gerente', 'inventario', 'vendedor']) {
        ref[rol] = (await pool.query('SELECT id_usuario FROM usuarios WHERE usuario = $1', [rol])).rows[0].id_usuario;
    }
    ref.cliente = (await pool.query(
        `INSERT INTO clientes (identificacion, nombre) VALUES ($1, $2) RETURNING id_cliente`,
        [`55${SUFIJO}1`, `Cliente ventas ${SUFIJO}`])).rows[0].id_cliente;
}

async function limpiar() {
    await pool.query(`UPDATE productos SET estado = FALSE WHERE sku LIKE $1`, [`TEST-VTA-%-${SUFIJO}`]);
    await pool.query(`UPDATE clientes SET estado = FALSE WHERE identificacion LIKE $1`, [`55${SUFIJO}%`]);
    await pool.end();
    servidor.kill();
}

const nuevoProducto = (letra, extra = {}) => ({
    id_categoria: 1, id_unidad: 1, sku: `TEST-VTA-${letra}-${SUFIJO}`, nombre: `Producto ventas ${letra} ${SUFIJO}`,
    descripcion: 'Prueba de integración', precio_compra: 1000, precio_venta: 2500, stock_minimo_bodega: 5, stock_minimo_almacen: 2, ...extra,
});

// --------------------------------- Catálogo (SCRUM-33/34/35) ---------------------------------

caso('Productos: exige sesión; Inventario crea con el contrato del frontend', async () => {
    assert.equal((await api('/products', { token: null })).status, 401);
    assert.equal((await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('X'), token: null })).status, 401);
    assert.equal((await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('X') })).status, 403); // vendedor

    const { status, body } = await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('A'), token: t.inventario });
    assert.equal(status, 201);
    assert.equal(body.message, 'Producto creado exitosamente');
    assert.equal(Number(body.producto.stock_total), 0);
    ref.a = body.producto.id_producto;
    ref.b = (await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('B', { precio_venta: 4000 }), token: t.admin })).body.producto.id_producto;

    assert.equal((await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('A'), token: t.inventario })).status, 409);
    assert.equal((await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('C', { precio_venta: 900 }), token: t.inventario })).status, 400);
    assert.equal((await api('/products', { metodo: 'POST', cuerpo: nuevoProducto('C', { id_categoria: 99999 }), token: t.inventario })).status, 400);
    assert.equal((await api('/products', { metodo: 'POST', cuerpo: { sku: 'x' }, token: t.inventario })).status, 400);
});

caso('Productos: el listado trae el stock por ubicación y oculta el costo al Vendedor', async () => {
    const buscar = async (token) => (await api(`/products?search=TEST-VTA-A-${SUFIJO}&limit=100`, { token })).body;
    const comoGerente = await buscar(t.gerente);
    assert.equal(comoGerente.data.length, 1);
    assert.equal(comoGerente.meta.hasNextPage, false);
    const p = comoGerente.data[0];
    for (const campo of ['id_producto', 'sku', 'nombre', 'categoria', 'unidad', 'precio_venta', 'stock_bodega', 'stock_almacen',
        'stock_total', 'stock_minimo_bodega', 'stock_minimo_almacen', 'estado', 'id_categoria', 'id_unidad']) {
        assert.ok(p[campo] !== undefined, `falta ${campo}`);
    }
    assert.equal(Number(p.precio_compra), 1000);
    assert.equal(p.categoria, 'Electrónica');
    assert.equal((await buscar(t.vendedor)).data[0].precio_compra, null);
});

caso('Productos: cambiar el precio queda en la auditoría con quien lo hizo (SCRUM-77)', async () => {
    assert.equal((await api(`/products/${ref.a}`, { metodo: 'PUT', cuerpo: { precio_venta: 3000 } })).status, 403);
    const { status, body } = await api(`/products/${ref.a}`, { metodo: 'PUT', cuerpo: { precio_venta: 3000, nombre: `Renombrado ${SUFIJO}` }, token: t.inventario });
    assert.equal(status, 200);
    assert.equal(Number(body.producto.precio_venta), 3000);
    assert.equal((await api(`/products/${ref.a}`, { metodo: 'PUT', cuerpo: { precio_venta: 500 }, token: t.inventario })).status, 400);
    assert.equal((await api('/products/99999999', { metodo: 'PUT', cuerpo: { nombre: 'x' }, token: t.inventario })).status, 404);

    const auditoria = (await api('/audit?accion=CAMBIO_PRECIO', { token: t.gerente })).body.data.find((l) => l.id_entidad === String(ref.a) || Number(l.id_entidad) === ref.a);
    assert.ok(auditoria, 'no se registró CAMBIO_PRECIO');
    assert.equal(auditoria.nombre_usuario, 'Encargado Inventario');
    assert.equal(Number(auditoria.datos_anteriores.precio_venta), 2500);
    assert.equal(Number(auditoria.datos_nuevos.precio_venta), 3000);
});

// --------------------------------- Traslados (HU-06) ---------------------------------

caso('Traslado Bodega -> Almacén con el contrato del frontend (SCRUM-124)', async () => {
    for (const id of [ref.a, ref.b]) {
        assert.equal((await api('/inventory/entries', { metodo: 'POST', cuerpo: { id_producto: id, cantidad: 10 }, token: t.inventario })).status, 201);
    }
    const { status, body } = await api('/inventory/transfers', {
        metodo: 'POST', token: t.inventario,
        cuerpo: { id_producto: ref.a, cantidad: 3, id_responsable: ref.gerente, motivo: 'Surtir vitrina' },
    });
    assert.equal(status, 201);
    for (const campo of ['id_movimiento', 'fecha_movimiento', 'cantidad', 'saldo_bodega', 'saldo_almacen']) {
        assert.ok(body.traslado[campo] !== undefined, `falta ${campo}`);
    }
    assert.equal(Number(body.traslado.saldo_bodega), 7);
    assert.equal(Number(body.traslado.saldo_almacen), 3);
    assert.equal(body.traslado.id_responsable, ref.gerente);
    assert.deepEqual(await stock(ref.a), { bodega: 7, almacen: 3 });

    const mov = (await api(`/inventory/kardex/${ref.a}`, { token: t.inventario })).body.movimientos.at(-1);
    assert.equal(mov.tipo_movimiento, 'TRASLADO_INTERNO');
    assert.equal(mov.nombre_responsable, 'Gerente SIMO');
});

caso('Traslado: 409 sin stock en Bodega, 400 datos inválidos, 404 producto, roles', async () => {
    const enviar = (cuerpo, token = t.inventario) => api('/inventory/transfers', { metodo: 'POST', cuerpo, token });
    const r = await enviar({ id_producto: ref.a, cantidad: 8 });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Stock insuficiente en Bodega/);
    for (const cuerpo of [{ id_producto: ref.a }, { id_producto: ref.a, cantidad: 0 }, { id_producto: ref.a, cantidad: 1.5 },
        { cantidad: 1 }, { id_producto: ref.a, cantidad: 1, id_responsable: 'x' }, { id_producto: ref.a, cantidad: 1, id_responsable: 99999999 }]) {
        assert.equal((await enviar(cuerpo)).status, 400, JSON.stringify(cuerpo));
    }
    assert.equal((await enviar({ id_producto: 99999999, cantidad: 1 })).status, 404);
    assert.equal((await enviar({ id_producto: ref.a, cantidad: 1 }, t.vendedor)).status, 403);
    assert.equal((await enviar({ id_producto: ref.a, cantidad: 1 }, null)).status, 401);
    assert.deepEqual(await stock(ref.a), { bodega: 7, almacen: 3 });
});

caso('El formulario de traslado y el POS pueden listar usuarios sin perder la sesión', async () => {
    for (const token of [t.inventario, t.vendedor]) {
        const { status, body } = await api('/users?limit=100', { token });
        assert.equal(status, 200);
        assert.ok(body.data.every((u) => u.password_hash === undefined));
    }
});

// --------------------------------- Venta POS (HU-07) ---------------------------------

caso('Venta con el contrato del POS: precios del servidor y deducción en cascada (RN-02)', async () => {
    const { status, body } = await api('/sales', {
        metodo: 'POST',
        cuerpo: {
            metodo_pago: 'EFECTIVO', id_cliente: ref.cliente, id_vendedor: null,
            subtotal: 1, descuento: 500, impuestos: 0, total: 1, // lo que mande el navegador no se usa
            detalles: [{ id_producto: ref.a, cantidad: 5, precio_unitario: 1 }, { id_producto: ref.b, cantidad: 2, precio_unitario: 1 }],
        },
    });
    assert.equal(status, 201);
    const v = body.venta;
    ref.venta = v.id_venta;
    assert.ok(v.fecha_venta);
    assert.equal(Number(v.subtotal), 5 * 3000 + 2 * 4000);
    assert.equal(Number(v.descuento), 500);
    assert.equal(Number(v.total), 22500);
    assert.equal(v.metodo_pago, 'EFECTIVO');
    assert.equal(v.nombre_usuario, 'Vendedor SIMO');
    const lineaA = v.detalles.find((d) => d.id_producto === ref.a);
    assert.equal(Number(lineaA.precio_unitario), 3000);
    assert.deepEqual([Number(lineaA.desde_almacen), Number(lineaA.desde_bodega)], [3, 2]);
    assert.ok(v.detalles.every((d) => d.costo_unitario === undefined), 'no expone el costo');
    assert.deepEqual(await stock(ref.a), { bodega: 5, almacen: 0 });
    assert.deepEqual(await stock(ref.b), { bodega: 8, almacen: 0 });
    assert.ok(await kardexOk(ref.a));
});

caso('Venta: 409 si no alcanza el stock total (RN-01) y no deja nada a medias', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM ventas')).rows[0].n;
    const r = await api('/sales', { metodo: 'POST', cuerpo: { metodo_pago: 'EFECTIVO', detalles: [{ id_producto: ref.b, cantidad: 1 }, { id_producto: ref.a, cantidad: 6 }] } });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Stock insuficiente/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ventas')).rows[0].n, antes);
    assert.deepEqual(await stock(ref.b), { bodega: 8, almacen: 0 });
});

caso('Venta: valida datos (400), producto inexistente (404) y roles', async () => {
    const vender = (cuerpo, token) => api('/sales', { metodo: 'POST', cuerpo, token });
    const linea = [{ id_producto: ref.b, cantidad: 1 }];
    for (const cuerpo of [{}, { detalles: [] }, { detalles: [{ id_producto: ref.b, cantidad: 0 }] }, { detalles: [{ cantidad: 1 }] },
        { detalles: [{ id_producto: ref.b, cantidad: 1.5 }] }, { detalles: linea, metodo_pago: 'BITCOIN' },
        { detalles: linea, descuento: -1 }, { detalles: linea, descuento: 999999 }, { detalles: linea, id_cliente: 99999999 },
        { detalles: linea, id_vendedor: ref.inventario }, { detalles: linea, referencia_pago: 'x'.repeat(41) }]) {
        assert.equal((await vender(cuerpo)).status, 400, JSON.stringify(cuerpo));
    }
    assert.equal((await vender({ detalles: [{ id_producto: 99999999, cantidad: 1 }] })).status, 404);
    assert.equal((await vender({ detalles: linea }, null)).status, 401);
    assert.equal((await vender({ detalles: linea }, t.inventario)).status, 403);
    assert.deepEqual(await stock(ref.b), { bodega: 8, almacen: 0 });
});

caso('20 ventas simultáneas de 1 unidad con 8 en stock: se venden exactamente 8', async () => {
    const respuestas = await Promise.all(Array.from({ length: 20 }, () => api('/sales', {
        metodo: 'POST', cuerpo: { metodo_pago: 'EFECTIVO', detalles: [{ id_producto: ref.b, cantidad: 1 }] },
    })));
    assert.equal(respuestas.filter((r) => r.status === 201).length, 8);
    assert.equal(respuestas.filter((r) => r.status === 409).length, 12);
    assert.deepEqual(await stock(ref.b), { bodega: 0, almacen: 0 });
    assert.ok(await kardexOk(ref.b));
});

caso('Historial GET /api/sales en el formato del frontend (VentaHistorial)', async () => {
    const { status, body } = await api('/sales', { token: t.gerente });
    assert.equal(status, 200);
    const v = body.data.find((x) => x.idVenta === ref.venta);
    assert.ok(v, 'la venta no aparece en el historial');
    assert.equal(typeof v.total, 'number');
    assert.equal(v.total, 22500);
    assert.equal(v.metodoPago, 'EFECTIVO');
    assert.equal(v.estado, 'COMPLETADA');
    assert.deepEqual(v.cliente, { id: ref.cliente, nombre: `Cliente ventas ${SUFIJO}`, documento: `55${SUFIJO}1` });
    assert.equal(v.vendedor.nombre, 'Vendedor SIMO');
    assert.equal(v.items.length, 2);
    for (const campo of ['idProducto', 'nombreProducto', 'codigoProducto', 'cantidad', 'precioUnitario', 'subtotal']) {
        assert.ok(v.items[0][campo] !== undefined, `falta ${campo}`);
    }
    assert.equal(v.anulacion, null);
    const sinCliente = body.data.find((x) => x.cliente.id === null);
    assert.equal(sinCliente.cliente.nombre, 'Consumidor Final');
    assert.ok(body.data.every((x, i) => i === 0 || new Date(x.fecha) <= new Date(body.data[i - 1].fecha)));
    assert.equal((await api('/sales?estado=ANULADA&desde=2000-01-01', { token: t.gerente })).body.data.some((x) => x.idVenta === ref.venta), false);
    assert.equal((await api('/sales?estado=X', { token: t.gerente })).status, 400);
    assert.equal((await api('/sales', { token: t.inventario })).status, 403);
    assert.equal((await api(`/sales/${ref.venta}`)).body.venta.id_venta, ref.venta);
    assert.equal((await api('/sales/99999999')).status, 404);
});

caso('Arqueo de caja: resumen diario por método de pago', async () => {
    const { status, body } = await api('/sales/daily-summary', { token: t.gerente });
    assert.equal(status, 200);
    const efectivo = body.resumen.find((r) => r.metodo_pago === 'EFECTIVO');
    assert.ok(efectivo.cantidad_transacciones >= 9);
    assert.ok(body.gran_total >= 22500);
    assert.equal((await api('/sales/daily-summary?fecha=ayer', { token: t.gerente })).status, 400);
    assert.equal((await api('/sales/daily-summary')).status, 403);
});

// --------------------------------- Anulación (CU-11) ---------------------------------

caso('Anulación con credenciales de Gerente: devuelve el stock y queda auditada', async () => {
    const anular = (cuerpo, token = t.vendedor, ruta = 'cancel') => api(`/sales/${ref.venta}/${ruta}`, { metodo: 'POST', cuerpo, token });
    assert.equal((await anular({ motivo: 'Cliente devolvió la compra' })).status, 403);                 // sin autorizador
    assert.equal((await anular({ motivo: 'abc', auth_email: 'gerente@simo.local', auth_password: 'Simo2026*' })).status, 400);
    assert.equal((await anular({ motivo: 'Cliente devolvió la compra', auth_email: 'gerente@simo.local', auth_password: 'incorrecta' })).status, 401);
    assert.equal((await anular({ motivo: 'Cliente devolvió la compra', auth_email: 'inventario@simo.local', auth_password: 'Simo2026*' })).status, 403);
    assert.deepEqual(await stock(ref.a), { bodega: 5, almacen: 0 });

    const { status, body } = await anular({ motivo: 'Cliente devolvió la compra', auth_email: 'GERENTE@simo.local', auth_password: 'Simo2026*' });
    assert.equal(status, 200);
    assert.ok(body.fecha);
    assert.equal(body.venta.estado, 'ANULADA');
    assert.deepEqual(await stock(ref.a), { bodega: 7, almacen: 3 });
    assert.deepEqual(await stock(ref.b), { bodega: 2, almacen: 0 });
    assert.ok(await kardexOk(ref.a));

    assert.equal((await anular({ motivo: 'Otra vez más', auth_email: 'gerente@simo.local', auth_password: 'Simo2026*' })).status, 409);
    assert.equal((await api('/sales/99999999/cancel', { metodo: 'POST', cuerpo: { motivo: 'No existe la venta' }, token: t.gerente })).status, 404);

    const enHistorial = (await api('/sales', { token: t.gerente })).body.data.find((x) => x.idVenta === ref.venta);
    assert.equal(enHistorial.estado, 'ANULADA');
    assert.equal(enHistorial.anulacion.autorizadoPor, 'Gerente SIMO');
    assert.equal(enHistorial.anulacion.rolAutorizador, 'GERENTE');
    assert.equal(enHistorial.anulacion.motivo, 'Cliente devolvió la compra');

    const log = (await api('/audit?accion=ANULACION_VENTA', { token: t.admin })).body.data.find((l) => Number(l.id_entidad) === ref.venta);
    assert.equal(log.nombre_usuario, 'Vendedor SIMO');
    assert.equal(log.nombre_autorizador, 'Gerente SIMO');
    assert.equal(log.justificacion, 'Cliente devolvió la compra');
});

caso('Un Gerente anula con su propia sesión; /annul es alias', async () => {
    const id = (await api('/sales', { metodo: 'POST', cuerpo: { detalles: [{ id_producto: ref.a, cantidad: 1 }] } })).body.venta.id_venta;
    const r = await api(`/sales/${id}/annul`, { metodo: 'POST', cuerpo: { motivo: 'Error de digitación' }, token: t.gerente });
    assert.equal(r.status, 200);
    assert.deepEqual(await stock(ref.a), { bodega: 7, almacen: 3 });
});

// --------------------------------- Pagos digitales (SCRUM-78) ---------------------------------

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

caso('Venta con Nequi: guarda la referencia y crea el pago pendiente de conciliar', async () => {
    const { status, body } = await api('/sales', {
        metodo: 'POST', cuerpo: { metodo_pago: 'NEQUI', referencia_pago: ` M${SUFIJO} `, detalles: [{ id_producto: ref.a, cantidad: 2 }] },
    });
    assert.equal(status, 201);
    ref.ventaNequi = body.venta.id_venta;
    assert.equal(body.venta.referencia_pago, `M${SUFIJO}`);

    assert.equal((await api('/payments/wallet')).status, 403);                    // el Vendedor no concilia
    const lista = await api(`/payments/wallet?estado=PENDIENTE&metodo=NEQUI&referencia=M${SUFIJO}`, { token: t.gerente });
    assert.equal(lista.status, 200);
    assert.equal(lista.body.data.length, 1);
    const pago = lista.body.data[0];
    assert.equal(pago.id_venta, ref.ventaNequi);
    assert.equal(pago.estado, 'PENDIENTE');
    assert.equal(Number(pago.total), 6000);
    assert.equal(pago.comprobante, null);
    assert.ok(lista.body.resumen.pendientes >= 1);
    for (const q of ['?estado=X', '?metodo=EFECTIVO', '?desde=ayer']) {
        assert.equal((await api(`/payments/wallet${q}`, { token: t.gerente })).status, 400, q);
    }
});

caso('Comprobante: sube PDF o imagen (máx. 5 MB), valida el tipo y se descarga', async () => {
    const subir = (cuerpo, tipo, { token = t.vendedor, id = ref.ventaNequi, nombre = 'pago nequi.pdf' } = {}) => api(
        `/payments/wallet/${id}/receipt?nombre=${encodeURIComponent(nombre)}`, { metodo: 'PUT', cuerpo, token, cabeceras: { 'Content-Type': tipo } });

    const ok = await subir(PDF, 'application/pdf');
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.comprobante.nombre, ok.body.comprobante.tipo, ok.body.comprobante.tamano], ['pago nequi.pdf', 'application/pdf', PDF.length]);

    assert.equal((await subir(PDF, 'application/x-msdownload')).status, 415);
    assert.equal((await subir(PNG, 'application/pdf')).status, 400);              // el contenido no es un PDF
    assert.equal((await subir(Buffer.alloc(5 * 1024 * 1024 + 1, 1), 'application/pdf')).status, 413);
    assert.equal((await subir(PDF, 'application/pdf', { id: ref.venta })).status, 404);   // venta en efectivo
    assert.equal((await subir(PDF, 'application/pdf', { token: t.inventario })).status, 403);

    // Reemplazo por una imagen, por la ruta que propuso el frontend; el nombre no admite rutas
    const img = await api(`/sales/${ref.ventaNequi}/comprobante?nombre=${encodeURIComponent('../../etc/captura.png')}`,
        { metodo: 'POST', cuerpo: PNG, cabeceras: { 'Content-Type': 'image/png' } });
    assert.equal(img.status, 200);
    assert.equal(img.body.comprobante.nombre, 'captura.png');

    assert.equal((await api(`/payments/wallet/${ref.ventaNequi}/receipt`, { crudo: true })).status, 403);
    const descarga = await api(`/payments/wallet/${ref.ventaNequi}/receipt`, { token: t.gerente, crudo: true });
    assert.equal(descarga.status, 200);
    assert.equal(descarga.headers.get('content-type'), 'image/png');
    assert.match(descarga.headers.get('content-disposition'), /attachment/);
    assert.ok(descarga.datos.equals(PNG));
    assert.equal((await api(`/payments/wallet/${ref.venta}/receipt`, { token: t.gerente })).status, 404);

    const enHistorial = (await api('/sales', { token: t.gerente })).body.data.find((x) => x.idVenta === ref.ventaNequi);
    assert.deepEqual(enHistorial.soportePago, { referencia: `M${SUFIJO}`, estado: 'PENDIENTE', comprobante: { nombre: 'captura.png', tipo: 'image/png', tamano: PNG.length } });
});

caso('Conciliación manual POST /api/payments/wallet-conciliation', async () => {
    const conciliar = (cuerpo, token = t.gerente) => api('/payments/wallet-conciliation', { metodo: 'POST', cuerpo, token });
    assert.equal((await conciliar({ id_venta: ref.ventaNequi, estado: 'CONCILIADO' }, t.vendedor)).status, 403);
    for (const cuerpo of [{}, { id_venta: ref.ventaNequi }, { id_venta: ref.ventaNequi, estado: 'PAGADO' },
        { id_venta: ref.ventaNequi, estado: 'RECHAZADO' }, { id_venta: 'x', estado: 'CONCILIADO' }]) {
        assert.equal((await conciliar(cuerpo)).status, 400, JSON.stringify(cuerpo));
    }
    assert.equal((await conciliar({ id_venta: ref.venta, estado: 'CONCILIADO' })).status, 404);   // venta en efectivo

    const ok = await conciliar({ id_venta: ref.ventaNequi, estado: 'conciliado', observacion: 'Aparece en el extracto' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.message, 'Pago conciliado');
    assert.equal(ok.body.pago.estado, 'CONCILIADO');
    assert.equal(ok.body.pago.nombre_conciliador, 'Gerente SIMO');
    assert.ok(ok.body.pago.conciliado_en);

    const rechazo = await conciliar({ id_venta: ref.ventaNequi, estado: 'RECHAZADO', observacion: 'No llegó', referencia: 'M-CORREGIDA' }, t.admin);
    assert.equal(rechazo.body.pago.estado, 'RECHAZADO');
    assert.equal(rechazo.body.pago.referencia, 'M-CORREGIDA');
    assert.equal((await conciliar({ id_venta: ref.ventaNequi, estado: 'PENDIENTE' })).body.pago.conciliado_por, null);

    // El pago de una venta anulada no se concilia
    await api(`/sales/${ref.ventaNequi}/cancel`, { metodo: 'POST', cuerpo: { motivo: 'Pago no recibido' }, token: t.gerente });
    assert.equal((await conciliar({ id_venta: ref.ventaNequi, estado: 'CONCILIADO' })).status, 409);
});

caso('Pedido convertido en venta con Daviplata: guarda la referencia y queda por conciliar', async () => {
    const pedido = (await api('/orders', {
        metodo: 'POST', cuerpo: { id_cliente: ref.cliente, fecha_entrega_pactada: new Date(Date.now() + 2 * 86400e3).toISOString(), lineas: [{ id_producto: ref.a, cantidad: 1 }] },
    })).body.pedido.id_pedido;
    for (const estado of ['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) {
        assert.equal((await api(`/orders/${pedido}/status`, { metodo: 'PATCH', cuerpo: { estado } })).status, 200);
    }
    const { status, body } = await api(`/orders/${pedido}/convert-to-sale`, { metodo: 'POST', cuerpo: { metodo_pago: 'DAVIPLATA', referencia_pago: `D${SUFIJO}` } });
    assert.equal(status, 201);
    assert.equal(body.venta.referencia_pago, `D${SUFIJO}`);
    const pago = (await api(`/payments/wallet?referencia=D${SUFIJO}`, { token: t.admin })).body.data[0];
    assert.equal(pago.id_pedido, pedido);
    assert.equal(pago.metodo_pago, 'DAVIPLATA');
});

// --------------------------------- Dashboard, alertas, reportes, auditoría ---------------------------------

caso('Dashboard: métricas del panel (SCRUM-67)', async () => {
    const { status, body } = await api('/dashboard/metrics', { token: t.gerente });
    assert.equal(status, 200);
    const d = body.data;
    for (const campo of ['ventas_totales', 'ventas_hoy', 'valor_monetario_stock', 'rotacion_productos', 'pedidos_abiertos', 'pedidos_vencidos', 'pagos_por_conciliar']) {
        assert.ok(d[campo] !== undefined, `falta ${campo}`);
    }
    assert.equal(typeof d.ventas_totales, 'number');
    assert.ok(d.ventas_hoy > 0 && d.valor_monetario_stock > 0);
    assert.ok(d.rotacion_productos.length >= 1 && d.rotacion_productos.length <= 5);
    assert.equal((await api('/dashboard/metrics')).status, 403);
    assert.equal((await api('/dashboard/metrics', { token: t.inventario })).status, 403);
});

caso('Alertas duales de stock: SURTIR el Almacén y COMPRAR para Bodega (SCRUM-68, HU-14)', async () => {
    // B quedó con 2 en Bodega y 0 en Almacén: mínimos 5 y 2 -> las dos alertas
    const { status, body } = await api('/dashboard/alerts', { token: t.inventario });
    assert.equal(status, 200);
    const b = body.productos_criticos.find((p) => p.id_producto === ref.b);
    assert.deepEqual(b.alertas, ['SURTIR', 'COMPRAR']);
    assert.equal(body.total_alertas, body.productos_criticos.length);
    assert.equal(body.pedidos_vencidos, undefined);                               // Inventario: solo stock
    const comoGerente = await api('/dashboard/alerts', { token: t.gerente });
    assert.ok(Array.isArray(comoGerente.body.pedidos_vencidos));
    assert.equal((await api('/dashboard/alerts')).status, 403);
});

caso('Reportes: catálogo con el contrato del frontend y descarga en Excel y PDF (SCRUM-76)', async () => {
    const { status, body } = await api('/reports', { token: t.gerente });
    assert.equal(status, 200);
    assert.ok(body.data.length >= 9);
    for (const r of body.data) {
        for (const campo of ['id_reporte', 'nombre', 'descripcion', 'categoria', 'formato', 'periodo', 'fecha_generacion', 'tamano_bytes', 'nombre_archivo']) {
            assert.ok(r[campo] !== undefined, `falta ${campo} en ${r.nombre}`);
        }
        assert.ok(r.tamano_bytes > 0);
        const archivo = await api(`/reports/${r.id_reporte}/download`, { token: t.admin, crudo: true });
        assert.equal(archivo.status, 200, r.nombre);
        // Excel es un zip (PK); PDF empieza por %PDF
        assert.equal(archivo.datos.subarray(0, r.formato === 'PDF' ? 4 : 2).toString('latin1'), r.formato === 'PDF' ? '%PDF' : 'PK', r.nombre);
        assert.match(archivo.headers.get('content-disposition'), new RegExp(r.formato === 'PDF' ? '\\.pdf"$' : '\\.xlsx"$'));
    }
    assert.ok(body.data.every((r) => ['EXCEL', 'PDF'].includes(r.formato)));
    assert.ok((await api('/reports?formato=PDF', { token: t.gerente })).body.data.every((r) => r.formato === 'PDF'));
    assert.equal((await api('/reports/999/download', { token: t.gerente })).status, 404);
    assert.equal((await api('/reports/inventory/pdf', { token: t.gerente, crudo: true })).datos.subarray(0, 4).toString(), '%PDF');
    assert.equal((await api('/reports', { token: t.vendedor })).status, 403);
    assert.equal((await api('/reports/1/download', { token: null })).status, 401);
});

caso('Auditoría GET /api/audit con el contrato del frontend; solo Gerente y Administrador', async () => {
    const { status, body } = await api('/audit', { token: t.gerente });
    assert.equal(status, 200);
    for (const campo of ['id_log', 'fecha', 'nombre_usuario', 'nombre_autorizador', 'accion', 'entidad', 'id_entidad', 'justificacion', 'datos_anteriores', 'datos_nuevos', 'direccion_ip']) {
        assert.ok(body.data[0][campo] !== undefined, `falta ${campo}`);
    }
    assert.ok(body.data.every((l, i) => i === 0 || new Date(l.fecha) <= new Date(body.data[i - 1].fecha)));
    assert.ok((await api('/audit?accion=anulacion_venta&limite=3', { token: t.admin })).body.data.every((l) => l.accion === 'ANULACION_VENTA'));
    assert.equal((await api('/audit?accion=OTRA', { token: t.admin })).status, 400);
    assert.equal((await api('/audit?desde=ayer', { token: t.admin })).status, 400);
    assert.equal((await api('/audit', { token: t.inventario })).status, 403);
    assert.equal((await api('/audit', { token: null })).status, 401);
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
// (before/after de node:test solo existen desde 18.8).
test('Ventas, traslados, pagos, reportes y auditoría', async (t2) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t2.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
