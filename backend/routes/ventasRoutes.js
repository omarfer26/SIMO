const express = require('express');
const pool = require('../db');
const { verificarToken, verificarRol } = require('../middleware/authMiddleware');

const router = express.Router();

// TASA DE IMPUESTO (Ejemplo: 19% IVA)
const TASA_IMPUESTO = 0.19;

// POST /api/sales - Procesar venta con deducción en cascada (RN-01, RN-02, HU-07)
router.post('/', verificarToken, verificarRol(1, 4), async (req, res) => {
    const items = req.body.detalles || req.body.productos;
    const id_usuario = req.usuario.id_usuario; // Extraído del token por el middleware
    const id_cliente = req.body.id_cliente || null;
    const metodoPagoParam = req.body.metodo_pago || 'EFECTIVO';
    const descuento = parseFloat(req.body.descuento || 0);

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Bad Request", message: "La venta debe incluir al menos un producto." });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener ID del método de pago
        let id_metodo_pago = 1;
        if (typeof metodoPagoParam === 'number') {
            id_metodo_pago = metodoPagoParam;
        } else {
            const metodoRes = await client.query(
                'SELECT id_metodo_pago FROM metodos_pago WHERE codigo = UPPER($1) LIMIT 1',
                [String(metodoPagoParam)]
            );
            if (metodoRes.rowCount > 0) {
                id_metodo_pago = metodoRes.rows[0].id_metodo_pago;
            }
        }

        let totalVenta = 0;
        let subtotalVenta = 0;
        let totalImpuestos = 0;
        const lineasProcesadas = [];

        // 2. Validar stock en vivo (RN-01) y calcular deducción en cascada (RN-02, HU-07)
        for (const item of items) {
            const cantidad = parseFloat(item.cantidad);
            if (isNaN(cantidad) || cantidad <= 0) {
                throw new Error(`La cantidad para el producto ID ${item.id_producto} debe ser mayor a cero.`);
            }

            // Bloquear producto con FOR UPDATE para evitar colisiones concurrentes
            const productoRes = await client.query(
                `SELECT id_producto, nombre, precio_compra, precio_venta, 
                        stock_bodega, stock_almacen, stock_total, estado 
                 FROM productos WHERE id_producto = $1 FOR UPDATE`,
                [item.id_producto]
            );

            if (productoRes.rowCount === 0) {
                const error = new Error(`El producto con ID ${item.id_producto} no existe.`);
                error.statusCode = 404;
                throw error;
            }

            const producto = productoRes.rows[0];

            if (producto.stock < item.cantidad) {
                const error = new Error(`Stock insuficiente para el producto: ${producto.nombre}. Stock actual: ${producto.stock}`);
                error.statusCode = 400;
                throw error;
            }

            const stockBodega = parseFloat(producto.stock_bodega || 0);
            const stockAlmacen = parseFloat(producto.stock_almacen || 0);
            const stockTotal = parseFloat(producto.stock_total !== undefined ? producto.stock_total : (stockBodega + stockAlmacen));

            // RN-01: Validar contra el stock total (Almacén + Bodega) para no perder ventas
            if (stockTotal < cantidad) {
                throw new Error(`Stock insuficiente para el producto: ${producto.nombre}. Stock actual: ${stockTotal} (Almacén: ${stockAlmacen}, Bodega: ${stockBodega})`);
            }

            // RN-02 / HU-07: Deducción en cascada (primero Almacén, el resto de Bodega)
            const deAlmacen = Math.min(cantidad, stockAlmacen);
            const deBodega = cantidad - deAlmacen;
            const nuevoAlmacen = stockAlmacen - deAlmacen;
            const nuevoBodega = stockBodega - deBodega;

            const precioUnitario = parseFloat(item.precio_unitario || producto.precio_venta || 0);
            const costoUnitario = parseFloat(producto.precio_compra || 0);
            const subtotalItem = Math.round(precioUnitario * cantidad * 100) / 100;

            subtotalVenta += subtotalItem;
            totalVenta += subtotalItem;

            lineasProcesadas.push({
                id_producto: item.id_producto,
                nombre: producto.nombre,
                cantidad,
                precio_unitario: precioUnitario,
                costo_unitario: costoUnitario,
                subtotal_linea: subtotalItem,
                deAlmacen,
                deBodega,
                nuevoAlmacen,
                nuevoBodega
            });
        }

        const totalFinal = Math.max(0, subtotalVenta - descuento);

        // 3. Registrar la venta principal (Tabla: ventas)
        const insertVentaQuery = `
            INSERT INTO ventas (id_cliente, id_usuario, id_metodo_pago, subtotal, descuento, impuestos, total, estado) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETADA') RETURNING id_venta, fecha_venta;
        `;
        const ventaRes = await client.query(insertVentaQuery, [
            id_cliente,
            id_usuario,
            id_metodo_pago,
            subtotalVenta,
            descuento,
            totalImpuestos,
            totalFinal
        ]);
        const { id_venta, fecha_venta } = ventaRes.rows[0];

        // 4. Registrar detalles, descontar stock en cascada y asentar en el Kardex
        for (const linea of lineasProcesadas) {
            // Insertar detalle de venta (RF-13)
            await client.query(`
                INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, costo_unitario, subtotal_linea) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [id_venta, linea.id_producto, linea.cantidad, linea.precio_unitario, linea.costo_unitario, linea.subtotal_linea]);

            // Descontar stock dual aplicando la cascada (RN-02)
            await client.query(`
                UPDATE productos 
                SET stock_almacen = $1, stock_bodega = $2 
                WHERE id_producto = $3
            `, [linea.nuevoAlmacen, linea.nuevoBodega, linea.id_producto]);

            // Asentar movimientos en Kardex (movimientos_inventario)
            if (linea.deAlmacen > 0) {
                await client.query(`
                    INSERT INTO movimientos_inventario (
                        id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                        saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia
                    ) VALUES ($1, 'SALIDA_VENTA', 'ALMACEN', $2, $3, $4, $5, $6, $7, $8)
                `, [
                    linea.id_producto,
                    linea.deAlmacen,
                    linea.costo_unitario,
                    linea.nuevoBodega + linea.deBodega, // saldo bodega al momento de este movimiento
                    linea.nuevoAlmacen,
                    id_usuario,
                    id_venta,
                    `VENTA-${id_venta}`
                ]);
            }

            if (linea.deBodega > 0) {
                await client.query(`
                    INSERT INTO movimientos_inventario (
                        id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                        saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia
                    ) VALUES ($1, 'SALIDA_VENTA', 'BODEGA', $2, $3, $4, $5, $6, $7, $8)
                `, [
                    linea.id_producto,
                    linea.deBodega,
                    linea.costo_unitario,
                    linea.nuevoBodega,
                    linea.nuevoAlmacen,
                    id_usuario,
                    id_venta,
                    `VENTA-${id_venta}`
                ]);
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: "success",
            message: "Venta procesada exitosamente",
            venta: {
                id_venta,
                fecha_venta,
                subtotal: subtotalVenta,
                descuento,
                total: totalFinal,
                detalles: lineasProcesadas.map(l => ({
                    id_producto: l.id_producto,
                    nombre: l.nombre,
                    cantidad: l.cantidad,
                    precio_unitario: l.precio_unitario,
                    subtotal: l.subtotal_linea,
                    deduccion_cascada: {
                        desde_almacen: l.deAlmacen,
                        desde_bodega: l.deBodega
                    }
                }))
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

// =====================================================================
// GET /api/sales/daily-summary - Resumen diario para arqueo de caja
// =====================================================================
router.get('/daily-summary', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    try {
        const query = `
            SELECT 
                metodo_pago, 
                COUNT(id_venta) as cantidad_transacciones, 
                SUM(total) as total_ingresos 
            FROM ventas 
            WHERE DATE(fecha_venta) = CURRENT_DATE AND estado != 'anulada'
            GROUP BY metodo_pago
            ORDER BY total_ingresos DESC;
        `;

        const { rows } = await pool.query(query);
        const granTotal = rows.reduce((acc, row) => acc + parseFloat(row.total_ingresos), 0);

        res.status(200).json({
            status: "success",
            mensaje: "Resumen diario generado exitosamente",
            fecha: new Date().toISOString().split('T')[0],
            resumen: rows,
            gran_total: granTotal
        });

    } catch (error) {
        next(error);
    }
});

// =====================================================================
// PUT /api/sales/:id/cancel - Anular venta y revertir stock (SCRUM-97)
// =====================================================================
router.put('/:id/cancel', verificarToken, verificarRol(1, 2), async (req, res, next) => {
    const id_venta = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar que la venta exista, no esté anulada y bloquear la fila
        const ventaRes = await client.query('SELECT estado FROM ventas WHERE id_venta = $1 FOR UPDATE', [id_venta]);

        if (ventaRes.rowCount === 0) {
            const error = new Error(`La venta con ID ${id_venta} no existe.`);
            error.statusCode = 404;
            throw error;
        }

        if (ventaRes.rows[0].estado === 'anulada') {
            const error = new Error('Esta venta ya se encuentra anulada previamente.');
            error.statusCode = 400;
            throw error;
        }

        // 2. Extraer los productos y cantidades exactas
        const detallesQuery = 'SELECT id_producto, cantidad FROM detalles_venta WHERE id_venta = $1';
        const detallesRes = await client.query(detallesQuery, [id_venta]);

        // 3. Devolver el stock iterando sobre los detalles
        for (const item of detallesRes.rows) {
            await client.query(
                'UPDATE productos SET stock = stock + $1 WHERE id_producto = $2',
                [item.cantidad, item.id_producto]
            );
        }

        // 4. Marcar la venta como anulada
        await client.query("UPDATE ventas SET estado = 'anulada' WHERE id_venta = $1", [id_venta]);

        await client.query('COMMIT');

        res.status(200).json({
            status: "success",
            message: `La venta #${id_venta} ha sido anulada exitosamente y el stock fue restaurado.`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

module.exports = router;