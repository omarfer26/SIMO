// src/repositories/inventario.repository.js
// Acceso a datos del módulo de inventario (db/migrations/006 y 008).
const pool = require('../config/db');

async function buscarProductoPorSku(sku) {
    const { rows } = await pool.query(`SELECT id_producto FROM productos WHERE sku = $1`, [sku]);
    return rows[0] || null;
}

// SCRUM-94 (HU-05): la función de la BD bloquea el producto, suma stock_bodega y
// registra el movimiento ENTRADA_COMPRA en una sola operación atómica.
async function registrarIngresoBodega({ idProducto, cantidad, idUsuario, costoUnitario, idProveedor, documentoReferencia, observacion }) {
    const { rows } = await pool.query(
        `SELECT m.id_movimiento, m.tipo_movimiento, m.ubicacion_destino, m.cantidad, m.costo_unitario,
                m.saldo_bodega, m.saldo_almacen, m.id_usuario, m.id_proveedor,
                m.documento_referencia, m.motivo AS observacion, m.fecha_movimiento,
                p.id_producto, p.sku, p.nombre,
                -- Los saldos se toman del movimiento: "p" es la foto del producto ANTES de
                -- la función (misma sentencia), así que p.stock_bodega aún no refleja el ingreso.
                m.saldo_bodega AS stock_bodega, m.saldo_almacen AS stock_almacen,
                m.saldo_bodega + m.saldo_almacen AS stock_total
         FROM fn_registrar_ingreso_bodega($1, $2, $3, $4, $5, $6, $7) m
         JOIN productos p ON p.id_producto = m.id_producto`,
        [idProducto, cantidad, idUsuario, costoUnitario, idProveedor, documentoReferencia, observacion]
    );
    return rows[0];
}

module.exports = { buscarProductoPorSku, registrarIngresoBodega };
