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
                p.total, ${VENCIDO} AS vencido, p.actualizado_en, v.id_venta
         FROM pedidos p
         JOIN clientes c ON c.id_cliente = p.id_cliente
         JOIN usuarios u ON u.id_usuario = p.id_usuario
         LEFT JOIN ventas v ON v.id_pedido = p.id_pedido
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
                (SELECT count(*)::int FROM detalles_pedidos d WHERE d.id_pedido = p.id_pedido) AS cantidad_productos,
                v.id_venta
         FROM pedidos p
         JOIN clientes c ON c.id_cliente = p.id_cliente
         JOIN usuarios u ON u.id_usuario = p.id_usuario
         LEFT JOIN ventas v ON v.id_pedido = p.id_pedido
         ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
         ORDER BY p.fecha_solicitud DESC, p.id_pedido DESC`,
        valores
    );
    return rows;
}

// SCRUM-61: cambio de estado con su efecto en el stock, todo en la base
// (fn_cambiar_estado_pedido, migración 016): al pasar a EN_PREPARACION
// descuenta en cascada; al cancelar devuelve lo descontado.
async function cambiarEstadoPedido({ idPedido, estado, idUsuario, motivo }) {
    const { rows } = await pool.query(
        'SELECT id_pedido, estado FROM fn_cambiar_estado_pedido($1, $2, $3, $4)',
        [idPedido, estado, idUsuario, motivo]
    );
    return rows[0];
}

// SCRUM-100: comprobante de la cancelación (CU-13 paso 9), tomado del registro
// inalterable de auditoría: quién, cuándo, causa y qué cantidades volvieron a
// cada ubicación con el saldo resultante.
async function obtenerComprobanteCancelacion(idPedido) {
    const { rows } = await pool.query(
        `SELECT l.fecha, l.id_usuario, u.nombre_completo AS nombre_usuario, l.justificacion AS causa,
                l.datos_anteriores ->> 'estado' AS estado_anterior,
                coalesce(l.datos_nuevos -> 'reversion', '[]'::jsonb) AS reversion
         FROM log_auditoria l
         JOIN usuarios u ON u.id_usuario = l.id_usuario
         WHERE l.accion = 'CANCELACION_PEDIDO' AND l.entidad = 'pedidos' AND l.id_entidad = $1
         ORDER BY l.id_log DESC LIMIT 1`,
        [idPedido]
    );
    return rows[0] || null;
}

// SCRUM-62: pedido ENTREGADO -> venta, sin mover stock (fn_convertir_pedido_en_venta, 017)
async function convertirEnVenta({ idPedido, idUsuario, idMetodoPago, descuento }) {
    const { rows } = await pool.query(
        'SELECT id_venta FROM fn_convertir_pedido_en_venta($1, $2, $3, $4)',
        [idPedido, idUsuario, idMetodoPago, descuento]
    );
    return rows[0].id_venta;
}

// Método de pago activo por código (EFECTIVO, NEQUI, ...) o por id
async function buscarMetodoPago({ codigo, id }) {
    const { rows } = await pool.query(
        `SELECT id_metodo_pago, codigo, nombre FROM metodos_pago
         WHERE estado AND (id_metodo_pago = $1 OR codigo = $2)`,
        [id ?? null, codigo ?? null]
    );
    return rows[0] || null;
}

async function obtenerVentaDePedido(idVenta) {
    const { rows } = await pool.query(
        `SELECT v.id_venta, v.id_pedido, v.id_cliente, c.nombre AS nombre_cliente, v.id_usuario,
                u.nombre_completo AS nombre_usuario, v.fecha_venta, mp.codigo AS metodo_pago,
                mp.nombre AS nombre_metodo_pago, v.subtotal, v.descuento, v.impuestos, v.total, v.estado
         FROM ventas v
         JOIN usuarios u ON u.id_usuario = v.id_usuario
         JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
         LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
         WHERE v.id_venta = $1`,
        [idVenta]
    );
    const lineas = await pool.query(
        `SELECT d.id_producto, p.sku, p.nombre, d.cantidad, d.precio_unitario, d.subtotal_linea
         FROM detalles_ventas d JOIN productos p ON p.id_producto = d.id_producto
         WHERE d.id_venta = $1 ORDER BY d.id_detalle_venta`,
        [idVenta]
    );
    // costo_unitario no se expone: es confidencial para el Vendedor
    return { ...rows[0], lineas: lineas.rows };
}

async function estadoCliente(idCliente) {
    const { rows } = await pool.query('SELECT estado FROM clientes WHERE id_cliente = $1', [idCliente]);
    return rows[0] ? rows[0].estado : null;
}

module.exports = {
    crearPedido,
    obtenerPedido,
    listarPedidos,
    cambiarEstadoPedido,
    obtenerComprobanteCancelacion,
    convertirEnVenta,
    buscarMetodoPago,
    obtenerVentaDePedido,
    estadoCliente,
};
