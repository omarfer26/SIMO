// tests/inventario.test.js
// Pruebas de integración del ingreso a Bodega (SCRUM-94 / HU-05).
// Requieren la base creada con db/00_init.sh (migraciones + seed) y las
// variables DB_* del .env. Levantan index.js en un puerto aparte.
//
// Los movimientos de inventario son inalterables, así que no se pueden
// borrar: cada ejecución crea sus propios productos de prueba (SKU TEST-...)
// y al terminar los deja inactivos para que no aparezcan en el catálogo.
//
//   npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const pool = require('../../src/config/db');
const { iniciarSesion } = require('./sesion');

const PORT = process.env.TEST_PORT_INVENTARIO || 3998;
const URL = `http://localhost:${PORT}/api/inventory/entries`;
const SUFIJO = Date.now();
let servidor;
const ref = {}; // ids de los datos de prueba
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);

let token; // sesión del Encargado de Inventario (seed)

async function ingresar(cuerpo, tokenSesion = token) {
    const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tokenSesion ? { Authorization: `Bearer ${tokenSesion}` } : {}) },
        body: JSON.stringify(cuerpo),
    });
    return { status: res.status, body: await res.json() };
}

async function stock(idProducto) {
    const { rows } = await pool.query(
        'SELECT stock_bodega::float AS bodega, stock_almacen::float AS almacen FROM productos WHERE id_producto = $1',
        [idProducto]
    );
    return rows[0];
}

async function crearProducto(sku, unidad, estado = true) {
    const { rows } = await pool.query(
        `INSERT INTO productos (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta, estado)
         SELECT (SELECT min(id_categoria) FROM categorias), u.id_unidad, $1, $2, 1000, 1500, $4
         FROM unidades_medida u WHERE u.abreviatura = $3
         RETURNING id_producto`,
        [sku, `Producto de prueba ${sku}`, unidad, estado]
    );
    return rows[0].id_producto;
}

async function preparar() {
    ref.unidad = await crearProducto(`TEST-U-${SUFIJO}`, 'und');
    ref.kilo = await crearProducto(`TEST-K-${SUFIJO}`, 'kg');
    ref.inactivo = await crearProducto(`TEST-I-${SUFIJO}`, 'und', false);
    ref.concurrente = await crearProducto(`TEST-C-${SUFIJO}`, 'und');
    ref.usuario = (await pool.query(`SELECT id_usuario FROM usuarios WHERE usuario = 'inventario'`)).rows[0].id_usuario;
    ref.proveedor = (await pool.query(`SELECT min(id_proveedor) AS id FROM proveedores`)).rows[0].id;

    servidor = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        servidor.stdout.on('data', (d) => d.toString().includes('corriendo') && resolve());
        servidor.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
    });
    token = await iniciarSesion(PORT, 'inventario@simo.local');
}

async function limpiar() {
    await pool.query(`UPDATE productos SET estado = FALSE WHERE sku LIKE $1`, [`TEST-%-${SUFIJO}`]);
    await pool.end();
    servidor.kill();
}

// --------------------------------- Caso de éxito ---------------------------------

caso('Registra el ingreso, suma solo a Bodega y devuelve el nuevo saldo (CU-05 CA-1)', async () => {
    const { status, body } = await ingresar({ id_producto: ref.unidad, cantidad: 10, id_usuario: ref.usuario });
    assert.equal(status, 201);
    assert.equal(body.movimiento.tipo_movimiento, 'ENTRADA_COMPRA');
    assert.equal(body.movimiento.ubicacion_destino, 'BODEGA');
    assert.equal(Number(body.movimiento.cantidad), 10);
    assert.equal(Number(body.producto.stock_bodega), 10);
    assert.equal(Number(body.producto.stock_almacen), 0);
    assert.equal(Number(body.producto.stock_total), 10);
    assert.deepEqual(await stock(ref.unidad), { bodega: 10, almacen: 0 });
});

caso('Deja el ingreso en el Kardex con el usuario responsable (CU-05 RB-3)', async () => {
    const { rows } = await pool.query(
        `SELECT entrada_bodega::float, entrada_almacen::float, saldo_bodega::float, id_usuario
         FROM v_kardex WHERE id_producto = $1 ORDER BY id_movimiento`,
        [ref.unidad]
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { entrada_bodega: 10, entrada_almacen: 0, saldo_bodega: 10, id_usuario: ref.usuario });
});

caso('Acepta el producto por SKU, con proveedor, documento, costo y observación', async () => {
    const { status, body } = await ingresar({
        sku: `TEST-U-${SUFIJO}`,
        cantidad: '5',
        costo_unitario: 1200.5,
        id_proveedor: ref.proveedor,
        documento_referencia: 'FAC-0001',
        observacion: 'Compra de prueba',
        id_usuario: ref.usuario,
    });
    assert.equal(status, 201);
    assert.equal(Number(body.movimiento.costo_unitario), 1200.5);
    assert.equal(body.movimiento.id_proveedor, ref.proveedor);
    assert.equal(body.movimiento.documento_referencia, 'FAC-0001');
    assert.equal(body.movimiento.observacion, 'Compra de prueba');
    assert.equal(Number(body.movimiento.saldo_bodega), 15);
});

caso('Admite cantidad decimal en productos por kilo', async () => {
    const { status, body } = await ingresar({ id_producto: ref.kilo, cantidad: 2.5, id_usuario: ref.usuario });
    assert.equal(status, 201);
    assert.equal(Number(body.producto.stock_bodega), 2.5);
});

// --------------------------------- Validaciones ---------------------------------

caso('Rechaza cantidad cero, negativa, vacía o no numérica (CU-05 EX-1)', async () => {
    const cero = await ingresar({ id_producto: ref.unidad, cantidad: 0, id_usuario: ref.usuario });
    assert.equal(cero.status, 400);
    assert.match(cero.body.message, /mayor a cero/);
    for (const cantidad of [-3, '', 'abc', null, undefined]) {
        const { status } = await ingresar({ id_producto: ref.unidad, cantidad, id_usuario: ref.usuario });
        assert.equal(status, 400, `cantidad=${cantidad}`);
    }
});

caso('Rechaza decimales en productos por unidad y más de 3 decimales', async () => {
    const porUnidad = await ingresar({ id_producto: ref.unidad, cantidad: 1.5, id_usuario: ref.usuario });
    assert.equal(porUnidad.status, 400);
    assert.match(porUnidad.body.message, /número entero/);
    for (const cantidad of [1.23456, 1e-7]) {
        const { status } = await ingresar({ id_producto: ref.kilo, cantidad, id_usuario: ref.usuario });
        assert.equal(status, 400, `cantidad=${cantidad}`);
    }
});

caso('Responde 404 si el producto no existe (por id o por SKU)', async () => {
    assert.equal((await ingresar({ id_producto: 99999999, cantidad: 1, id_usuario: ref.usuario })).status, 404);
    assert.equal((await ingresar({ sku: 'NO-EXISTE-XYZ', cantidad: 1, id_usuario: ref.usuario })).status, 404);
});

caso('Responde 409 si el producto está inactivo', async () => {
    const { status, body } = await ingresar({ id_producto: ref.inactivo, cantidad: 1, id_usuario: ref.usuario });
    assert.equal(status, 409);
    assert.match(body.message, /inactivo/);
});

caso('Exige producto, proveedor existente y costo válido (400)', async () => {
    assert.equal((await ingresar({ cantidad: 1 })).status, 400);
    assert.equal((await ingresar({ id_producto: ref.unidad, cantidad: 1, id_proveedor: 99999999 })).status, 400);
    assert.equal((await ingresar({ id_producto: ref.unidad, cantidad: 1, costo_unitario: -5 })).status, 400);
});

caso('Exige sesión y rol INVENTARIO o ADMIN; el responsable sale del token (CU-05)', async () => {
    assert.equal((await ingresar({ id_producto: ref.unidad, cantidad: 1 }, null)).status, 401);
    const vendedor = await iniciarSesion(PORT, 'vendedor@simo.local');
    assert.equal((await ingresar({ id_producto: ref.unidad, cantidad: 1 }, vendedor)).status, 403);
    // id_usuario en el cuerpo se ignora: el responsable es el usuario de la sesión
    const { status, body } = await ingresar({ id_producto: ref.kilo, cantidad: 1, id_usuario: 99999999 });
    assert.equal(status, 201);
    assert.equal(body.movimiento.id_usuario, ref.usuario);
});

caso('Los ingresos rechazados no modifican el stock ni el Kardex', async () => {
    assert.deepEqual(await stock(ref.unidad), { bodega: 15, almacen: 0 });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM movimientos_inventario WHERE id_producto = $1', [ref.unidad]);
    assert.equal(rows[0].n, 2);
});

// --------------------------------- Concurrencia (RNF-04) ---------------------------------

caso('25 ingresos simultáneos sobre el mismo producto no pierden unidades', async () => {
    const N = 25;
    const respuestas = await Promise.all(
        Array.from({ length: N }, () => ingresar({ id_producto: ref.concurrente, cantidad: 2, id_usuario: ref.usuario }))
    );
    assert.ok(respuestas.every((r) => r.status === 201));
    assert.deepEqual(await stock(ref.concurrente), { bodega: N * 2, almacen: 0 });

    // Cada movimiento debe haber visto un saldo distinto: 2, 4, ..., 50
    const saldos = respuestas.map((r) => Number(r.body.movimiento.saldo_bodega)).sort((a, b) => a - b);
    assert.deepEqual(saldos, Array.from({ length: N }, (_, i) => (i + 1) * 2));
});

// Una prueba contenedora con subpruebas: compatible con cualquier Node 18
// (before/after de node:test solo existen desde 18.8).
test('Ingreso a Bodega (HU-05)', async (t) => {
    await preparar();
    try {
        for (const [nombre, fn] of casos) {
            await t.test(nombre, fn);
        }
    } finally {
        await limpiar();
    }
});
