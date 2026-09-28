// index.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Configuración de la conexión a PostgreSQL usando variables de entorno
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Middlewares
app.use(cors());
app.use(express.json()); // Permite a Express leer el cuerpo (body) de las peticiones en formato JSON

// =====================================================================
// ENDPOINT: POST /api/products (Tarea SCRUM-33)
// =====================================================================
app.post('/api/products', async (req, res) => {
    try {
        // 1. Extraer los datos enviados en el cuerpo de la petición (req.body)
        const {
            id_categoria,
            codigo_barras,
            nombre,
            descripcion,
            precio_compra,
            precio_venta,
            stock_minimo
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
        if (!id_categoria || !nombre || !precio_compra || !precio_venta) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Faltan campos obligatorios (id_categoria, nombre, precio_compra, precio_venta)."
            });
        }

        // 3. Preparar la consulta SQL de Inserción
        // Usamos $1, $2, etc., para evitar inyecciones SQL (Consultas Parametrizadas)
        const insertQuery = `
      INSERT INTO productos 
      (id_categoria, codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock_minimo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *; -- Esto hace que PostgreSQL devuelva el registro recién insertado
    `;

        const values = [
            id_categoria,
            codigo_barras,
            nombre,
            descripcion,
            precio_compra,
            precio_venta,
            stock_minimo || 5 // Por defecto 5 si no lo envían, acorde a nuestra DB
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
                message: "Ya existe un producto con ese código de barras."
            });
        }

        // Captura de errores de llave foránea (Ej: Intentar vincular a una categoría que no existe)
        if (error.code === '23503') {
            return res.status(400).json({
                error: "Bad Request",
                message: "El id_categoria proporcionado no existe en la base de datos."
            });
        }

        res.status(500).json({ error: "Internal Server Error", message: "Error al guardar el producto en la base de datos." });
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor de inventario corriendo en http://localhost:${port}`);
});