// src/repositories/ventas.repository.js
// Acceso a datos de ventas (db/migrations/005, 020 y 022).
const pool = require('../config/db');

// HU-07: la venta completa (stock, líneas, Kardex) ocurre en fn_registrar_venta
async function registrarVenta({ idUsuario, idMetodoPago, lineas, idCliente, descuento, referenciaPago }) {
    const { rows } = await pool.query(
        'SELECT id_venta FROM fn_registrar_venta($1, $2, $3::jsonb, $4, $5, $6)',
        [idUsuario, idMetodoPago, JSON.stringify(lineas), idCliente, descuento, referenciaPago]
    );
    return rows[0].id_venta;
}

// CU-11: anulación con autorizador, reverso de stock y auditoría
async function anularVenta({ idVenta, idUsuario, idAutorizador, motivo }) {
    const { rows } = await pool.query(
        'SELECT id_venta, anulada_en FROM fn_anular_venta($1, $2, $3, $4)',
        [idVenta, idUsuario, idAutorizador, motivo]
    );
    return rows[0];
}

// Venta en el formato de la API (snake_case), con sus líneas. Sin costos.
async function obtenerVenta(idVenta) {
    const { rows } = await pool.query(
        `SELECT v.id_venta, v.fecha_venta, v.id_pedido, v.id_cliente, c.nombre AS nombre_cliente,
                v.id_usuario, u.nombre_completo AS nombre_usuario,
                mp.codigo AS metodo_pago, mp.nombre AS nombre_metodo_pago, v.referencia_pago,
                v.subtotal, v.descuento, v.impuestos, v.total, v.estado
         FROM ventas v
         JOIN usuarios u ON u.id_usuario = v.id_usuario
         JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
         LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
         WHERE v.id_venta = $1`,
        [idVenta]
    );
    if (!rows[0]) return null;
    const detalles = await pool.query(
        `SELECT d.id_producto, p.sku, p.nombre, d.cantidad, d.precio_unitario, d.subtotal_linea AS subtotal,
                -- Cuánto salió de cada ubicación (deducción en cascada, RN-02)
                coalesce((SELECT sum(m.cantidad) FROM movimientos_inventario m
                          WHERE m.id_venta = d.id_venta AND m.id_producto = d.id_producto
                            AND m.tipo_movimiento = 'SALIDA_VENTA' AND m.ubicacion_origen = 'ALMACEN'), 0) AS desde_almacen,
                coalesce((SELECT sum(m.cantidad) FROM movimientos_inventario m
                          WHERE m.id_venta = d.id_venta AND m.id_producto = d.id_producto
                            AND m.tipo_movimiento = 'SALIDA_VENTA' AND m.ubicacion_origen = 'BODEGA'), 0) AS desde_bodega
         FROM detalles_ventas d
         JOIN productos p ON p.id_producto = d.id_producto
         WHERE d.id_venta = $1
         ORDER BY d.id_detalle_venta`,
        [idVenta]
    );
    return { ...rows[0], detalles: detalles.rows };
}

// Historial para /ventas y el Dashboard, en el formato que consume el
// frontend tal cual (VentaHistorial de simoapp/lib/ventas/tipos.ts): nombres
// en camelCase y números como números, no como texto.
async function listarVentas({ desde, hasta, estado, limite }) {
    const condiciones = [];
    const valores = [];
    const agregar = (sql, valor) => { valores.push(valor); condiciones.push(sql.replace('?', `$${valores.length}`)); };
    if (desde) agregar('v.fecha_venta >= ?', desde);
    if (hasta) agregar('v.fecha_venta <= ?', hasta);
    if (estado) agregar('v.estado = ?', estado);
    valores.push(limite);

    const { rows } = await pool.query(
        `SELECT v.id_venta AS "idVenta", v.fecha_venta AS fecha,
                v.total::float AS total, v.subtotal::float AS subtotal,
                v.descuento::float AS descuento, v.impuestos::float AS impuestos,
                mp.codigo AS "metodoPago", v.estado, v.id_pedido AS "idPedido",
                jsonb_build_object('id', c.id_cliente, 'nombre', coalesce(c.nombre, 'Consumidor Final'),
                                   'documento', c.identificacion) AS cliente,
                jsonb_build_object('id', u.id_usuario, 'nombre', u.nombre_completo) AS vendedor,
                coalesce((SELECT jsonb_agg(jsonb_build_object(
                                 'idProducto', d.id_producto, 'nombreProducto', p.nombre, 'codigoProducto', p.sku,
                                 'cantidad', d.cantidad::float, 'precioUnitario', d.precio_unitario::float,
                                 'subtotal', d.subtotal_linea::float) ORDER BY d.id_detalle_venta)
                          FROM detalles_ventas d JOIN productos p ON p.id_producto = d.id_producto
                          WHERE d.id_venta = v.id_venta), '[]'::jsonb) AS items,
                CASE WHEN pd.id_pago IS NOT NULL OR v.referencia_pago IS NOT NULL THEN
                     jsonb_build_object(
                         'referencia', coalesce(pd.referencia, v.referencia_pago, ''),
                         'estado', pd.estado,
                         'comprobante', CASE WHEN pd.comprobante_nombre IS NOT NULL THEN
                             jsonb_build_object('nombre', pd.comprobante_nombre, 'tipo', pd.comprobante_tipo,
                                                'tamano', octet_length(pd.comprobante_datos)) END)
                END AS "soportePago",
                CASE WHEN v.estado = 'ANULADA' THEN
                     jsonb_build_object('fecha', v.anulada_en, 'autorizadoPor', au.nombre_completo,
                                        'idAutorizador', au.id_usuario, 'rolAutorizador', ar.codigo,
                                        'motivo', v.motivo_anulacion)
                END AS anulacion
         FROM ventas v
         JOIN usuarios u ON u.id_usuario = v.id_usuario
         JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
         LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
         LEFT JOIN pagos_digitales pd ON pd.id_venta = v.id_venta
         LEFT JOIN usuarios au ON au.id_usuario = v.autorizada_por
         LEFT JOIN roles ar ON ar.id_rol = au.id_rol
         ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
         ORDER BY v.fecha_venta DESC, v.id_venta DESC
         LIMIT $${valores.length}`,
        valores
    );
    return rows;
}

// Arqueo de caja: ventas completadas de un día por método de pago
async function resumenDiario(inicioDia, finDia) {
    const { rows } = await pool.query(
        `SELECT mp.codigo AS metodo_pago, mp.nombre AS nombre_metodo_pago,
                count(v.id_venta)::int AS cantidad_transacciones,
                coalesce(sum(v.total), 0)::float AS total_ingresos
         FROM ventas v
         JOIN metodos_pago mp ON mp.id_metodo_pago = v.id_metodo_pago
         WHERE v.estado = 'COMPLETADA' AND v.fecha_venta >= $1 AND v.fecha_venta <= $2
         GROUP BY mp.codigo, mp.nombre
         ORDER BY total_ingresos DESC`,
        [inicioDia, finDia]
    );
    return rows;
}

// Usuario para autorizar una anulación o atribuir la venta: con hash y rol
async function buscarUsuarioPorCorreo(correo) {
    const { rows } = await pool.query(
        `SELECT u.id_usuario, u.nombre_completo, u.correo, u.password_hash, u.estado, r.codigo AS rol
         FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
         WHERE u.correo = $1`,
        [correo]
    );
    return rows[0] || null;
}

async function buscarUsuarioActivo(idUsuario) {
    const { rows } = await pool.query(
        `SELECT u.id_usuario, u.nombre_completo, r.codigo AS rol
         FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
         WHERE u.id_usuario = $1 AND u.estado`,
        [idUsuario]
    );
    return rows[0] || null;
}

module.exports = {
    registrarVenta,
    anularVenta,
    obtenerVenta,
    listarVentas,
    resumenDiario,
    buscarUsuarioPorCorreo,
    buscarUsuarioActivo,
};
