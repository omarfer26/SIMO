// index.js
const express = require('express');
const cors = require('cors');
const pool = require('./src/config/db'); // Conexión a PostgreSQL usando variables de entorno
const usuariosRoutes = require('./src/routes/usuarios.routes');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json()); // Permite a Express leer el cuerpo (body) de las peticiones en formato JSON

// Módulo de usuarios (SCRUM-22, SCRUM-23)
app.use('/api/users', usuariosRoutes);

// =====================================================================
// ENDPOINT: POST /api/products (Tarea SCRUM-33)
// =====================================================================
app.post('/api/products', async (req, res) => {
    try {
        // 1. Extraer los datos enviados en el cuerpo de la petición (req.body)
        const {
            id_categoria,
            id_unidad,
            sku,
            nombre,
            descripcion,
            precio_compra,
            precio_venta,
            stock_minimo_bodega,
            stock_minimo_almacen
        } = req.body;

        // 2. Validación de Negocio (Requisito de la Tarea):
        // Validar que el precio de venta sea superior al de compra
        if (parseFloat(precio_venta) <= parseFloat(precio_compra)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Regla de negocio no cumplida: El precio de venta debe ser obligatoriamente superior al precio de compra."
            });
        }

        // Validación extra para evitar errores comunes
        if (!id_categoria || !id_unidad || !sku || !nombre || !precio_compra || !precio_venta) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Faltan campos obligatorios (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)."
            });
        }

        // 3. Preparar la consulta SQL de Inserción
        // Usamos $1, $2, etc., para evitar inyecciones SQL (Consultas Parametrizadas)
        const insertQuery = `
      INSERT INTO productos 
      (id_categoria, id_unidad, sku, nombre, descripcion, precio_compra, precio_venta,
       stock_minimo_bodega, stock_minimo_almacen)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *; -- Esto hace que PostgreSQL devuelva el registro recién insertado
    `;

        const values = [
            id_categoria,
            id_unidad,
            sku,
            nombre,
            descripcion,
            precio_compra,
            precio_venta,
            stock_minimo_bodega || 0, // Por defecto 0 si no lo envían, acorde a nuestra DB
            stock_minimo_almacen || 0
        ];

        // 4. Ejecutar la consulta en la Base de Datos
        const result = await pool.query(insertQuery, values);
        const nuevoProducto = result.rows[0];

        // 5. Responder al cliente (Frontend/Postman) con éxito
        res.status(201).json({
            message: "Producto creado exitosamente",
            producto: nuevoProducto
        });

    } catch (error) {
        console.error('Error al insertar producto:', error);

        // Captura de errores específicos de PostgreSQL (Ej: Violación de llave única - UNIQUE constraint)
        if (error.code === '23505') {
            return res.status(409).json({
                error: "Conflict",
                message: "El código SKU ya está registrado."
            });
        }

        // Captura de errores de llave foránea (Ej: Intentar vincular a una categoría que no existe)
        if (error.code === '23503') {
            return res.status(400).json({
                error: "Bad Request",
                message: "El id_categoria o id_unidad proporcionado no existe en la base de datos."
            });
        }

        res.status(500).json({ error: "Internal Server Error", message: "Error al guardar el producto en la base de datos." });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor de inventario corriendo en http://localhost:${port}`);
});