// src/repositories/pedidos.repository.js
// Acceso a datos de pedidos (db/migrations/004 y 014).
// HU-10: ciclo secuencial de estados + reserva de stock en preparación.
const pool = require('../config/db');

// Fila que consume el frontend en /pedidos (mismo contrato que el mock).
// stock_reservado es derivado: el stock sale del catálogo al pasar a
// EN_PREPARACION y solo lo devuelve una cancelación.
const FILA_PEDIDO = `
    SELECT p.id_pedido,
           c.nombre          AS nombre_cliente,
           u.nombre_completo AS nombre_usuario,
           p.estado,
           p.fecha_solicitud,
           p.fecha_entrega_pactada,
           p.direccion_entrega,
           p.observaciones,
           p.total,
           v.id_venta,
           (p.estado IN ('EN_PREPARACION', 'LISTO', 'ENTREGADO')) AS stock_reservado
    FROM pedidos p
    JOIN clientes c ON c.id_cliente = p.id_cliente
    JOIN usuarios u ON u.id_usuario = p.id_usuario
    LEFT JOIN ventas v ON v.id_pedido = p.id_pedido
`;

// El filtro por fechas usa el día de Colombia, igual que la pantalla.
async function listarPedidos({ desde, hasta } = {}) {
    const condiciones = [];
    const valores = [];

    if (desde) {
        valores.push(desde);
        condiciones.push(`(p.fecha_solicitud AT TIME ZONE 'America/Bogota')::date >= $${valores.length}::date`);
    }
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`(p.fecha_solicitud AT TIME ZONE 'America/Bogota')::date <= $${valores.length}::date`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await pool.query(
        `${FILA_PEDIDO} ${where} ORDER BY p.fecha_solicitud DESC, p.id_pedido DESC`,
        valores
    );
    return rows;
}

// Fila con el mismo contrato, con un ejecutor cualquiera (pool o cliente en
// transacción), para reutilizarla dentro de registrar/cambiar estado.
async function filaPedido(ejecutor, idPedido) {
    const { rows } = await ejecutor.query(`${FILA_PEDIDO} WHERE p.id_pedido = $1`, [idPedido]);
    return rows[0] || null;
}

async function obtenerPedido(idPedido) {
    const { rows } = await pool.query(`${FILA_PEDIDO} WHERE p.id_pedido = $1`, [idPedido]);
    if (!rows.length) return null;

    const { rows: lineas } = await pool.query(
        `SELECT d.id_producto, pr.sku, pr.nombre, d.cantidad, d.precio_unitario, d.subtotal_linea
         FROM detalles_pedidos d
         JOIN productos pr ON pr.id_producto = d.id_producto
         WHERE d.id_pedido = $1
         ORDER BY d.id_detalle_pedido`,
        [idPedido]
    );
    return { ...rows[0], lineas };
}

async function obtenerCliente(idCliente) {
    const { rows } = await pool.query(
        `SELECT id_cliente, nombre, estado FROM clientes WHERE id_cliente = $1`,
        [idCliente]
    );
    return rows[0] || null;
}

async function obtenerProductos(ids) {
    const { rows } = await pool.query(
        `SELECT id_producto, sku, nombre, precio_venta, stock_total, estado
         FROM productos WHERE id_producto = ANY($1::int[])`,
        [ids]
    );
    return new Map(rows.map((r) => [r.id_producto, r]));
}

// HU-10 / CU-12: el pedido nace REGISTRADO. El precio de cada línea y el
// total los pone la base con el precio de venta vigente (no el front).
// La fecha pactada se lleva al final del día elegido en hora de Colombia.
async function registrarPedido({ idCliente, idUsuario, fechaEntregaPactada, direccionEntrega, observaciones, lineas }) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        // Trigger de historial: exige el usuario responsable en la sesión.
        await cliente.query("SELECT set_config('simo.id_usuario', $1, true)", [String(idUsuario)]);

        const { rows } = await cliente.query(
            `INSERT INTO pedidos (id_cliente, id_usuario, fecha_entrega_pactada, direccion_entrega, observaciones)
             VALUES ($1, $2, (($3::date + 1)::timestamp - interval '1 second') AT TIME ZONE 'America/Bogota', $4, $5)
             RETURNING id_pedido`,
            [idCliente, idUsuario, fechaEntregaPactada, direccionEntrega, observaciones]
        );
        const idPedido = rows[0].id_pedido;

        const insertadas = await cliente.query(
            `INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea)
             SELECT $1, l.id_producto, l.cantidad, p.precio_venta, round(l.cantidad * p.precio_venta, 2)
             FROM jsonb_to_recordset($2::jsonb) AS l(id_producto INTEGER, cantidad NUMERIC)
             JOIN productos p ON p.id_producto = l.id_producto`,
            [idPedido, JSON.stringify(lineas)]
        );
        // Si algún producto desapareció entre la validación y el INSERT.
        if (insertadas.rowCount !== lineas.length) {
            const error = new Error('Algún producto del pedido ya no existe');
            error.code = 'SM001';
            throw error;
        }

        await cliente.query(
            `UPDATE pedidos
                SET total = coalesce((SELECT sum(subtotal_linea) FROM detalles_pedidos WHERE id_pedido = $1), 0)
              WHERE id_pedido = $1`,
            [idPedido]
        );

        const pedido = await filaPedido(cliente, idPedido);
        await cliente.query('COMMIT');
        return pedido;
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

// HU-10: único punto que mueve el estado de un pedido. La secuencialidad la
// valida el trigger de la migración 004; aquí se encadenan los efectos de
// negocio dentro de la MISMA transacción:
//   EN_PREPARACION -> reserva el stock (fn_salida_pedido)
//   CANCELADO      -> devuelve el stock (fn_reverso_pedido) + auditoría (HU-15)
// Devuelve null si el pedido no existe.
async function cambiarEstadoPedido({ idPedido, nuevoEstado, motivo, idUsuario }) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query("SELECT set_config('simo.id_usuario', $1, true)", [String(idUsuario)]);
        await cliente.query("SELECT set_config('simo.motivo', $1, true)", [motivo || '']);

        const { rows } = await cliente.query(
            `SELECT estado FROM pedidos WHERE id_pedido = $1 FOR UPDATE`,
            [idPedido]
        );
        if (!rows.length) {
            await cliente.query('ROLLBACK');
            return null;
        }
        const estadoAnterior = rows[0].estado;

        if (estadoAnterior === nuevoEstado) {
            const error = new Error(`El pedido ${idPedido} ya está en estado ${nuevoEstado}`);
            error.code = 'SM021';
            throw error;
        }

        await cliente.query(`UPDATE pedidos SET estado = $2 WHERE id_pedido = $1`, [idPedido, nuevoEstado]);

        if (nuevoEstado === 'EN_PREPARACION') {
            await cliente.query('SELECT * FROM fn_salida_pedido($1, $2)', [idPedido, idUsuario]);
        } else if (nuevoEstado === 'CANCELADO') {
            await cliente.query('SELECT * FROM fn_reverso_pedido($1, $2)', [idPedido, idUsuario]);
            // HU-15: toda cancelación deja su registro inalterable en la misma transacción.
            await cliente.query(
                `INSERT INTO log_auditoria
                     (id_usuario, accion, entidad, id_entidad, justificacion, datos_anteriores, datos_nuevos)
                 VALUES ($1, 'CANCELACION_PEDIDO', 'pedidos', $2, $3, $4::jsonb, $5::jsonb)`,
                [
                    idUsuario,
                    idPedido,
                    motivo,
                    JSON.stringify({ estado: estadoAnterior }),
                    JSON.stringify({ estado: nuevoEstado }),
                ]
            );
        }

        const pedido = await filaPedido(cliente, idPedido);
        await cliente.query('COMMIT');
        return pedido;
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = {
    listarPedidos,
    obtenerPedido,
    obtenerCliente,
    obtenerProductos,
    registrarPedido,
    cambiarEstadoPedido,
};
