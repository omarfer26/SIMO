// src/repositories/inventario.repository.js
// Acceso a datos del módulo de inventario (db/migrations/006, 008 y 011).
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

// SCRUM-45: registra una compra con sus líneas y, si se pide, la confirma con
// el procedimiento sp_confirmar_compra. Todo en una transacción: si cualquier
// línea falla, no queda ni la compra ni movimientos.
async function registrarCompra({ idProveedor, documentoReferencia, observacion, lineas, idUsuario, confirmar }) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const { rows } = await cliente.query(
            `INSERT INTO compras (id_proveedor, documento_referencia, observacion, id_usuario)
             VALUES ($1, $2, $3, $4) RETURNING id_compra`,
            [idProveedor, documentoReferencia, observacion, idUsuario]
        );
        const idCompra = rows[0].id_compra;
        for (const linea of lineas) {
            // Sin costo indicado se usa el precio de compra del producto
            await cliente.query(
                `INSERT INTO detalles_compras (id_compra, id_producto, cantidad, costo_unitario)
                 SELECT $1, p.id_producto, $3, coalesce($4, p.precio_compra)
                 FROM productos p WHERE p.id_producto = $2`,
                [idCompra, linea.idProducto, linea.cantidad, linea.costoUnitario]
            );
        }
        if (confirmar) {
            await cliente.query('CALL sp_confirmar_compra($1, $2)', [idCompra, idUsuario]);
        }
        await cliente.query('COMMIT');
        return idCompra;
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

async function obtenerCompra(idCompra) {
    const { rows } = await pool.query(
        `SELECT c.id_compra, c.estado, c.id_proveedor, pr.nombre AS proveedor, c.documento_referencia,
                c.observacion, c.total, c.id_usuario, c.confirmada_por, c.confirmada_en, c.creado_en
         FROM compras c LEFT JOIN proveedores pr ON pr.id_proveedor = c.id_proveedor
         WHERE c.id_compra = $1`,
        [idCompra]
    );
    if (!rows.length) return null;
    const { rows: lineas } = await pool.query(
        `SELECT d.id_producto, p.sku, p.nombre, d.cantidad, d.costo_unitario, d.subtotal_linea,
                p.stock_bodega, p.stock_almacen, p.stock_total
         FROM detalles_compras d JOIN productos p ON p.id_producto = d.id_producto
         WHERE d.id_compra = $1
         ORDER BY d.id_detalle_compra`,
        [idCompra]
    );
    return { ...rows[0], lineas };
}

async function existenProductos(ids) {
    const { rows } = await pool.query(`SELECT id_producto FROM productos WHERE id_producto = ANY($1::int[])`, [ids]);
    return new Set(rows.map((r) => r.id_producto));
}

async function idsPorSku(skus) {
    const { rows } = await pool.query(`SELECT sku, id_producto FROM productos WHERE sku = ANY($1::varchar[])`, [skus]);
    return new Map(rows.map((r) => [r.sku, r.id_producto]));
}

// SCRUM-42: ajuste manual de stock. fn_registrar_ajuste bloquea el producto,
// cambia el stock de la ubicación, deja el movimiento en el Kardex y el registro
// en log_auditoria en una sola operación.
async function registrarAjuste({ idProducto, tipo, ubicacion, cantidad, motivo, idUsuario, costoUnitario }) {
    const { rows } = await pool.query(
        `SELECT m.id_movimiento, m.fecha_movimiento, m.tipo_movimiento,
                coalesce(m.ubicacion_destino, m.ubicacion_origen) AS ubicacion,
                m.cantidad, m.costo_unitario, m.saldo_bodega, m.saldo_almacen,
                m.motivo, m.id_usuario, m.id_producto
         FROM fn_registrar_ajuste($1, $2, $3, $4, $5, $6, $7) m`,
        [idProducto, tipo, ubicacion, cantidad, motivo, idUsuario, costoUnitario]
    );
    return rows[0];
}

module.exports = {
    buscarProductoPorSku,
    registrarAjuste,
    registrarIngresoBodega,
    registrarCompra,
    obtenerCompra,
    existenProductos,
    idsPorSku,
};
