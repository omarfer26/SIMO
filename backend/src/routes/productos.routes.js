// src/routes/productos.routes.js
// Catálogo de productos (HU-04, SCRUM-33/34/35). Montado en /api/products.
//
// Antes vivía en index.js sin autenticación: cualquiera podía crear o
// modificar productos y leer los precios de compra. Ahora exige sesión y
// aplica la matriz de roles del frontend (lib/auth/permisos.ts):
//   Inventario gestiona · Administrador también · Gerente lee con costo ·
//   Vendedor lee sin costo.
const express = require('express');
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../../middleware/authMiddleware');

const router = express.Router();
const gestionan = verificarRol('INVENTARIO', 'ADMIN');

const REGLA_PRECIO = 'Regla de negocio no cumplida: El precio de venta debe ser obligatoriamente superior al precio de compra.';
const CODIGOS_DATO_INVALIDO = ['23514', '22P02', '22003', '22001'];

// Columnas del catálogo; precio_compra se agrega según el rol
const COLUMNAS = `
    p.id_producto, p.id_categoria, c.nombre AS categoria, p.id_unidad, u.nombre AS unidad,
    p.sku, p.nombre, p.descripcion, p.imagen_url, p.precio_venta,
    p.stock_bodega, p.stock_almacen, p.stock_total,
    p.stock_minimo_bodega, p.stock_minimo_almacen, p.estado
`;

// POST /api/products (SCRUM-33)
router.post('/', verificarToken, gestionan, async (req, res) => {
    try {
        const {
            id_categoria, id_unidad, sku, nombre, descripcion,
            precio_compra, precio_venta, stock_minimo_bodega, stock_minimo_almacen,
        } = req.body || {};

        if (parseFloat(precio_venta) <= parseFloat(precio_compra)) {
            return res.status(400).json({ error: 'Bad Request', message: REGLA_PRECIO });
        }
        if (!id_categoria || !sku || !nombre || precio_compra === undefined || precio_compra === null || !precio_venta) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Faltan campos obligatorios (id_categoria, sku, nombre, precio_compra, precio_venta).',
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO productos
                 (id_categoria, id_unidad, sku, nombre, descripcion, precio_compra, precio_venta,
                  stock_minimo_bodega, stock_minimo_almacen)
             VALUES ($1, coalesce($2, (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und')),
                     $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [id_categoria, id_unidad || null, String(sku).trim(), String(nombre).trim(), descripcion ?? null,
                precio_compra, precio_venta, stock_minimo_bodega || 0, stock_minimo_almacen || 0]
        );
        return res.status(201).json({ message: 'Producto creado exitosamente', producto: rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Conflict', message: 'El código SKU ya está registrado.' });
        }
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Bad Request', message: 'El id_categoria o id_unidad proporcionado no existe en la base de datos.' });
        }
        if (CODIGOS_DATO_INVALIDO.includes(error.code)) {
            return res.status(400).json({ error: 'Bad Request', message: 'Hay datos inválidos en el producto (precios y stock mínimo deben ser números no negativos).' });
        }
        console.error('Error al insertar producto:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error al guardar el producto en la base de datos.' });
    }
});

// GET /api/products?page=&limit=&search= (SCRUM-34)
router.get('/', verificarToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        if (page < 1 || limit < 1) {
            return res.status(400).json({
                error: 'Bad Request',
                message: "Los parámetros 'page' y 'limit' deben ser números enteros positivos.",
            });
        }

        const valores = [];
        let where = '';
        if (search !== '') {
            valores.push(`%${search}%`, search);
            where = 'WHERE (p.nombre ILIKE $1 OR p.sku = $2)';
        }
        const total = await pool.query(`SELECT count(*)::int AS n FROM productos p ${where}`, valores);
        const totalItems = total.rows[0].n;
        const totalPages = Math.ceil(totalItems / limit);

        // precio_compra es confidencial para el Vendedor
        const costo = req.usuario.rol === 'VENDEDOR' ? 'NULL::numeric AS precio_compra' : 'p.precio_compra';
        const { rows } = await pool.query(
            `SELECT ${COLUMNAS}, ${costo}
             FROM productos p
             JOIN categorias c ON c.id_categoria = p.id_categoria
             JOIN unidades_medida u ON u.id_unidad = p.id_unidad
             ${where}
             ORDER BY p.id_producto DESC
             LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
            [...valores, limit, (page - 1) * limit]
        );
        return res.status(200).json({
            data: rows,
            meta: {
                totalItems,
                itemsPerPage: limit,
                totalPages,
                currentPage: page,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        });
    } catch (error) {
        console.error('Error al obtener los productos:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Ocurrió un problema al consultar la base de datos.' });
    }
});

// PUT /api/products/:id (SCRUM-35)
// El cambio de precio queda en log_auditoria (trigger de la migración 023),
// por eso la actualización fija simo.id_usuario dentro de la transacción.
router.put('/:id', verificarToken, gestionan, async (req, res) => {
    const { id } = req.params;
    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({ error: 'Bad Request', message: 'El ID del producto debe ser un entero positivo.' });
    }
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const actual = await cliente.query('SELECT precio_compra, precio_venta FROM productos WHERE id_producto = $1 FOR UPDATE', [id]);
        if (actual.rowCount === 0) {
            await cliente.query('ROLLBACK');
            return res.status(404).json({ error: 'Not Found', message: `No existe ningún producto con el ID ${id}.` });
        }
        const {
            id_categoria, id_unidad, sku, nombre, descripcion,
            precio_compra, precio_venta, stock_minimo_bodega, stock_minimo_almacen, estado,
        } = req.body || {};

        const compra = precio_compra !== undefined ? parseFloat(precio_compra) : parseFloat(actual.rows[0].precio_compra);
        const venta = precio_venta !== undefined ? parseFloat(precio_venta) : parseFloat(actual.rows[0].precio_venta);
        if (venta <= compra) {
            await cliente.query('ROLLBACK');
            return res.status(400).json({ error: 'Bad Request', message: REGLA_PRECIO });
        }

        await cliente.query(`SELECT set_config('simo.id_usuario', $1, true)`, [String(req.usuario.id_usuario)]);
        const { rows } = await cliente.query(
            `UPDATE productos
             SET id_categoria = COALESCE($1, id_categoria),
                 id_unidad = COALESCE($2, id_unidad),
                 sku = COALESCE($3, sku),
                 nombre = COALESCE($4, nombre),
                 descripcion = COALESCE($5, descripcion),
                 precio_compra = COALESCE($6, precio_compra),
                 precio_venta = COALESCE($7, precio_venta),
                 stock_minimo_bodega = COALESCE($8, stock_minimo_bodega),
                 stock_minimo_almacen = COALESCE($9, stock_minimo_almacen),
                 estado = COALESCE($10, estado)
             WHERE id_producto = $11
             RETURNING *`,
            [id_categoria ?? null, id_unidad ?? null, sku ?? null, nombre ?? null, descripcion ?? null,
                precio_compra ?? null, precio_venta ?? null, stock_minimo_bodega ?? null, stock_minimo_almacen ?? null,
                estado ?? null, id]
        );
        await cliente.query('COMMIT');
        return res.status(200).json({ message: 'Producto actualizado exitosamente', producto: rows[0] });
    } catch (error) {
        await cliente.query('ROLLBACK');
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Conflict', message: 'El SKU ingresado ya pertenece a otro producto.' });
        }
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Bad Request', message: 'El id_categoria o id_unidad especificado no existe en la base de datos.' });
        }
        if (CODIGOS_DATO_INVALIDO.includes(error.code)) {
            return res.status(400).json({ error: 'Bad Request', message: 'Hay datos inválidos en el producto.' });
        }
        console.error('Error al actualizar producto:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error al actualizar el producto en la base de datos.' });
    } finally {
        cliente.release();
    }
});

module.exports = router;
