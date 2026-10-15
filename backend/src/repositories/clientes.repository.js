// src/repositories/clientes.repository.js
// Acceso a datos de clientes (db/migrations/004 y 009).
const pool = require('../config/db');

const COLUMNAS = `
    c.id_cliente, c.tipo_identificacion, c.identificacion, c.nombre, c.telefono,
    c.correo, c.direccion, c.estado, c.creado_en, c.actualizado_en
`;

async function crearCliente({ tipoIdentificacion, identificacion, nombre, telefono, correo, direccion }) {
    const { rows } = await pool.query(
        `INSERT INTO clientes (tipo_identificacion, identificacion, nombre, telefono, correo, direccion)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${COLUMNAS.replace(/c\./g, '')}`,
        [tipoIdentificacion, identificacion, nombre, telefono, correo, direccion]
    );
    return rows[0];
}

async function obtenerPorId(idCliente) {
    const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM clientes c WHERE c.id_cliente = $1`, [idCliente]);
    return rows[0] || null;
}

async function obtenerPorDocumento(identificacion) {
    const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM clientes c WHERE c.identificacion = $1`, [identificacion]);
    return rows[0] || null;
}

// Búsqueda para el listado y el autocompletado del POS: el documento se busca
// por prefijo (usa idx_clientes_identificacion_prefijo) y el nombre por contenido.
async function listarClientes({ page, limit, busquedaDocumento, busquedaNombre, estado }) {
    const condiciones = [];
    const valores = [];

    if (estado !== undefined) {
        valores.push(estado);
        condiciones.push(`c.estado = $${valores.length}`);
    }
    if (busquedaNombre !== undefined) {
        const escapar = (t) => t.replace(/[\\%_]/g, '\\$&');
        const filtros = [];
        if (busquedaDocumento) {
            valores.push(`${escapar(busquedaDocumento)}%`);
            filtros.push(`c.identificacion LIKE $${valores.length}`);
        }
        valores.push(`%${escapar(busquedaNombre)}%`);
        filtros.push(`c.nombre ILIKE $${valores.length}`);
        condiciones.push(`(${filtros.join(' OR ')})`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [datos, conteo] = await Promise.all([
        pool.query(
            `SELECT ${COLUMNAS}
             FROM clientes c
             ${where}
             ORDER BY c.nombre, c.id_cliente
             LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
            [...valores, limit, offset]
        ),
        pool.query(`SELECT count(*)::int AS total FROM clientes c ${where}`, valores),
    ]);

    return { data: datos.rows, total: conteo.rows[0].total };
}

// Solo actualiza los campos recibidos; el documento no se toca (CU-09 RB-1).
async function actualizarCliente(idCliente, campos) {
    const columnas = Object.keys(campos);
    const asignaciones = columnas.map((col, i) => `${col} = $${i + 2}`);
    const { rows } = await pool.query(
        `UPDATE clientes SET ${asignaciones.join(', ')}
         WHERE id_cliente = $1
         RETURNING ${COLUMNAS.replace(/c\./g, '')}`,
        [idCliente, ...columnas.map((col) => campos[col])]
    );
    return rows[0] || null;
}

// HU-009 criterio 2: compras previas y pedidos del cliente, con un resumen.
async function obtenerHistorial(idCliente, limite) {
    const [resumen, compras, pedidos] = await Promise.all([
        pool.query(
            `SELECT
                 count(*) FILTER (WHERE estado = 'COMPLETADA')::int                 AS compras_completadas,
                 coalesce(sum(total) FILTER (WHERE estado = 'COMPLETADA'), 0)       AS total_comprado,
                 max(fecha_venta) FILTER (WHERE estado = 'COMPLETADA')              AS ultima_compra,
                 (SELECT count(*)::int FROM pedidos WHERE id_cliente = $1)          AS pedidos_totales,
                 (SELECT count(*)::int FROM pedidos WHERE id_cliente = $1
                     AND estado NOT IN ('ENTREGADO', 'CANCELADO'))                  AS pedidos_abiertos
             FROM ventas WHERE id_cliente = $1`,
            [idCliente]
        ),
        pool.query(
            `SELECT v.id_venta, v.fecha_venta, v.estado, v.subtotal, v.descuento, v.impuestos, v.total,
                    mp.nombre AS metodo_pago, v.id_pedido,
                    (SELECT count(*)::int FROM detalles_ventas d WHERE d.id_venta = v.id_venta) AS productos
             FROM ventas v
             JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
             WHERE v.id_cliente = $1
             ORDER BY v.fecha_venta DESC, v.id_venta DESC
             LIMIT $2`,
            [idCliente, limite]
        ),
        pool.query(
            `SELECT p.id_pedido, p.fecha_solicitud, p.fecha_entrega_pactada, p.estado, p.total,
                    (p.estado NOT IN ('ENTREGADO', 'CANCELADO') AND p.fecha_entrega_pactada < now()) AS vencido,
                    (SELECT count(*)::int FROM detalles_pedidos d WHERE d.id_pedido = p.id_pedido) AS productos
             FROM pedidos p
             WHERE p.id_cliente = $1
             ORDER BY p.fecha_solicitud DESC, p.id_pedido DESC
             LIMIT $2`,
            [idCliente, limite]
        ),
    ]);

    return { resumen: resumen.rows[0], compras: compras.rows, pedidos: pedidos.rows };
}

module.exports = {
    crearCliente,
    obtenerPorId,
    obtenerPorDocumento,
    listarClientes,
    actualizarCliente,
    obtenerHistorial,
};
