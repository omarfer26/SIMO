// src/repositories/pedidos.repository.js
// Acceso a datos de pedidos de clientes (db/migrations/004 y 015).
const pool = require('../config/db');

// Un pedido abierto está vencido si ya pasó su fecha pactada (se calcula, no se guarda)
const VENCIDO = `(p.fecha_entrega_pactada < now() AND p.estado NOT IN ('ENTREGADO', 'CANCELADO'))`;

// SCRUM-81: registra el pedido en estado REGISTRADO con sus líneas, en una
// transacción. El precio de cada línea es el precio de venta vigente del
// producto (no lo decide quien llama). El trigger de 004 deja el estado
// inicial en el historial con el usuario de simo.id_usuario, y el de 015
// calcula el total. El stock NO se descuenta aquí: eso ocurre al pasar a
// EN_PREPARACION (SCRUM-61).
async function crearPedido({ idCliente, idUsuario, fechaEntregaPactada, direccionEntrega, observaciones, lineas }) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query(`SELECT set_config('simo.id_usuario', $1, true)`, [String(idUsuario)]);
        const { rows } = await cliente.query(
            `INSERT INTO pedidos (id_cliente, id_usuario, fecha_entrega_pactada, direccion_entrega, observaciones)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_pedido`,
            [idCliente, idUsuario, fechaEntregaPactada, direccionEntrega, observaciones]
        );
        const idPedido = rows[0].id_pedido;
        for (const linea of lineas) {
            await cliente.query(
                `INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea)
                 SELECT $1, p.id_producto, $3, p.precio_venta, round($3 * p.precio_venta, 2)
                 FROM productos p WHERE p.id_producto = $2`,
                [idPedido, linea.idProducto, linea.cantidad]
            );
        }
        await cliente.query('COMMIT');
        return idPedido;
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

async function obtenerPedido(idPedido) {
    const { rows } = await pool.query(
        `SELECT p.id_pedido, p.id_cliente, c.nombre AS nombre_cliente, c.identificacion AS identificacion_cliente,
                c.telefono AS telefono_cliente, p.id_usuario, u.nombre_completo AS nombre_usuario,
                p.estado, p.fecha_solicitud, p.fecha_entrega_pactada, p.direccion_entrega, p.observaciones,
                p.total, ${VENCIDO} AS vencido, p.actualizado_en
         FROM pedidos p
         JOIN clientes c ON c.id_cliente = p.id_cliente
         JOIN usuarios u ON u.id_usuario = p.id_usuario
         WHERE p.id_pedido = $1`,
        [idPedido]
    );
    if (!rows[0]) return null;
    const pedido = rows[0];

    // disponible: hoy alcanza el stock (Bodega + Almacén). Es informativo: el
    // stock se reserva recién al pasar a EN_PREPARACION.
    const lineas = await pool.query(
        `SELECT d.id_detalle_pedido, d.id_producto, pr.sku, pr.nombre, um.abreviatura AS unidad,
                d.cantidad, d.precio_unitario, d.subtotal_linea,
                pr.stock_total, pr.stock_total >= d.cantidad AS disponible
         FROM detalles_pedidos d
         JOIN productos pr ON pr.id_producto = d.id_producto
         JOIN unidades_medida um ON um.id_unidad = pr.id_unidad
         WHERE d.id_pedido = $1
         ORDER BY d.id_detalle_pedido`,
        [idPedido]
    );
    const historial = await pool.query(
        `SELECT h.estado_anterior, h.estado_nuevo, h.fecha, h.motivo, h.id_usuario, u.nombre_completo AS nombre_usuario
         FROM historial_estados_pedido h
         JOIN usuarios u ON u.id_usuario = h.id_usuario
         WHERE h.id_pedido = $1
         ORDER BY h.fecha, h.id_historial`,
        [idPedido]
    );
    return { ...pedido, lineas: lineas.rows, historial: historial.rows };
}

// Listado para /pedidos (contrato del frontend, SCRUM-125). desde y hasta
// filtran por fecha_solicitud; estado e id_cliente son opcionales.
async function listarPedidos({ desde, hasta, estado, idCliente }) {
    const condiciones = [];
    const valores = [];
    const agregar = (sql, valor) => { valores.push(valor); condiciones.push(sql.replace('?', `$${valores.length}`)); };
    if (desde) agregar('p.fecha_solicitud >= ?', desde);
    if (hasta) agregar('p.fecha_solicitud <= ?', hasta);
    if (estado) agregar('p.estado = ?', estado);
    if (idCliente) agregar('p.id_cliente = ?', idCliente);

    const { rows } = await pool.query(
        `SELECT p.id_pedido, p.id_cliente, c.nombre AS nombre_cliente, p.id_usuario, u.nombre_completo AS nombre_usuario,
                p.estado, p.fecha_solicitud, p.fecha_entrega_pactada, p.total, ${VENCIDO} AS vencido,
                (SELECT count(*)::int FROM detalles_pedidos d WHERE d.id_pedido = p.id_pedido) AS cantidad_productos
         FROM pedidos p
         JOIN clientes c ON c.id_cliente = p.id_cliente
         JOIN usuarios u ON u.id_usuario = p.id_usuario
         ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
         ORDER BY p.fecha_solicitud DESC, p.id_pedido DESC`,
        valores
    );
    return rows;
}

async function estadoCliente(idCliente) {
    const { rows } = await pool.query('SELECT estado FROM clientes WHERE id_cliente = $1', [idCliente]);
    return rows[0] ? rows[0].estado : null;
}

module.exports = { crearPedido, obtenerPedido, listarPedidos, estadoCliente };
