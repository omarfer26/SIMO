const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const usuariosRoutes = require('./routes/usuariosRoutes');
const ventasRoutes = require('./routes/ventasRoutes');
const errorHandler = require('./middleware/errorHandler');
const reservasRoutes = require('./routes/reservasRoutes');
const iniciarLimpiezaDeReservas = require('./cron/limpiarReservas');

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');

const app = express();
const port = process.env.PORT || 3001;

// =====================================================================
// MIDDLEWARES DE SEGURIDAD Y CONFIGURACIÓN BASE
// =====================================================================

// 1. Helmet: Protege la aplicación configurando cabeceras HTTP seguras
app.use(helmet());

// Middlewares base
app.use(cors());
app.use(express.json());

// 2. Sanitización contra XSS (Cross-Site Scripting)
app.use(xss());

// 3. Rate Limiting: Limitar a 100 peticiones por minuto por IP
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // Límite máximo de peticiones
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too Many Requests",
        message: "Has superado el límite de peticiones permitidas. Por favor, intenta de nuevo en un minuto."
    }
});

// Tus enrutadores actuales
app.use('/api/sales', ventasRoutes);
app.use('/api/users', usuariosRoutes);

// Aplicar el limitador a todas las rutas de la API
app.use('/api', limiter);

// =====================================================================
// ENRUTADORES
// =====================================================================
app.use('/api/sales', ventasRoutes);
app.use('/api/users', usuariosRoutes);
app.use('/api/reservations', reservasRoutes);

// =====================================================================
// ENDPOINTS PRINCIPALES
// =====================================================================

// Estado del servicio (Healthcheck)
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch (error) {
        res.status(503).json({ status: 'error', database: 'unavailable' });
    }
});

// =====================================================================
// ENDPOINT 1: POST /api/products (Tarea SCRUM-33)
// =====================================================================
app.post('/api/products', async (req, res) => {
    try {
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

        if (parseFloat(precio_venta) <= parseFloat(precio_compra)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Regla de negocio no cumplida: El precio de venta debe ser obligatoriamente superior al precio de compra."
            });
        }

        if (!id_categoria || !nombre || !precio_compra || !precio_venta) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Faltan campos obligatorios (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)."
            });
        }

        const insertQuery = `
      INSERT INTO productos 
      (id_categoria, codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock_minimo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

        const values = [
            id_categoria,
            id_unidad,
            sku,
            nombre,
            descripcion,
            precio_compra,
            precio_venta,
            stock_minimo_bodega || 5
        ];

        const result = await pool.query(insertQuery, values);
        const nuevoProducto = result.rows[0];

        res.status(201).json({
            message: "Producto creado exitosamente",
            producto: nuevoProducto
        });

    } catch (error) {
        console.error('Error al insertar producto:', error);

        if (error.code === '23505') {
            return res.status(409).json({
                error: "Conflict",
                message: "El código SKU ya está registrado."
            });
        }

        if (error.code === '23503') {
            return res.status(400).json({
                error: "Bad Request",
                message: "El id_categoria o id_unidad proporcionado no existe en la base de datos."
            });
        }

        res.status(500).json({
            error: "Internal Server Error",
            message: "Error al guardar el producto en la base de datos."
        });
    }
});

// =====================================================================
// ENDPOINT 2: GET /api/products (Tarea SCRUM-34)
// =====================================================================
app.get('/api/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';

        if (page < 1 || limit < 1) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Los parámetros 'page' y 'limit' deben ser números enteros positivos."
            });
        }

        const offset = (page - 1) * limit;

        let baseWhere = `WHERE 1=1`;
        let values = [];
        let queryIndex = 1;

        if (search.trim() !== '') {
            baseWhere += ` AND (nombre ILIKE $${queryIndex} OR codigo_barras = $${queryIndex + 1})`;
            values.push(`%${search.trim()}%`);
            values.push(search.trim());
            queryIndex += 2;
        }

        const countQuery = `SELECT COUNT(*) FROM productos ${baseWhere}`;
        const totalResult = await pool.query(countQuery, values);
        const totalItems = parseInt(totalResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        const selectQuery = `
            SELECT 
                id_producto, 
                id_categoria, 
                codigo_barras, 
                nombre, 
                descripcion, 
                precio_compra, 
                precio_venta, 
                stock_actual, 
                stock_minimo,
                estado 
            FROM productos 
            ${baseWhere} 
            ORDER BY id_producto DESC 
            LIMIT $${queryIndex} OFFSET $${queryIndex + 1}
        `;

        values.push(limit);
        values.push(offset);

        const productsResult = await pool.query(selectQuery, values);

        res.status(200).json({
            data: productsResult.rows,
            meta: {
                totalItems: totalItems,
                itemsPerPage: limit,
                totalPages: totalPages,
                currentPage: page,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error('Error al obtener los productos:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Ocurrió un problema al consultar la base de datos."
        });
    }
});

// =====================================================================
// ENDPOINT 3: PUT /api/products/:id (Tarea SCRUM-35)
// =====================================================================
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (isNaN(id)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "El ID del producto debe ser un valor numérico entero."
            });
        }

        const productCheck = await pool.query('SELECT * FROM productos WHERE id_producto = $1', [id]);
        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: `No existe ningún producto con el ID ${id}.`
            });
        }

        const productoActual = productCheck.rows[0];

        const {
            id_categoria,
            codigo_barras,
            nombre,
            descripcion,
            precio_compra,
            precio_venta,
            stock_minimo,
            estado
        } = req.body;

        const finalPrecioCompra = precio_compra !== undefined ? parseFloat(precio_compra) : parseFloat(productoActual.precio_compra);
        const finalPrecioVenta = precio_venta !== undefined ? parseFloat(precio_venta) : parseFloat(productoActual.precio_venta);

        if (finalPrecioVenta <= finalPrecioCompra) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Regla de negocio no cumplida: El precio de venta debe ser obligatoriamente superior al precio de compra."
            });
        }

        const updateQuery = `
            UPDATE productos 
            SET 
                id_categoria = COALESCE($1, id_categoria),
                codigo_barras = COALESCE($2, codigo_barras),
                nombre = COALESCE($3, nombre),
                descripcion = COALESCE($4, descripcion),
                precio_compra = COALESCE($5, precio_compra),
                precio_venta = COALESCE($6, precio_venta),
                stock_minimo = COALESCE($7, stock_minimo),
                estado = COALESCE($8, estado),
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id_producto = $9
            RETURNING *;
        `;

        const values = [
            id_categoria !== undefined ? id_categoria : null,
            codigo_barras !== undefined ? codigo_barras : null,
            nombre !== undefined ? nombre : null,
            descripcion !== undefined ? descripcion : null,
            precio_compra !== undefined ? precio_compra : null,
            precio_venta !== undefined ? precio_venta : null,
            stock_minimo !== undefined ? stock_minimo : null,
            estado !== undefined ? estado : null,
            id
        ];

        const result = await pool.query(updateQuery, values);
        const productoActualizado = result.rows[0];

        res.status(200).json({
            message: "Producto actualizado exitosamente",
            producto: productoActualizado
        });

    } catch (error) {
        console.error('Error al actualizar producto:', error);

        if (error.code === '23505') {
            return res.status(409).json({
                error: "Conflict",
                message: "El código de barras ingresado ya pertenece a otro producto."
            });
        }

        if (error.code === '23503') {
            return res.status(400).json({
                error: "Bad Request",
                message: "El id_categoria especificado no existe en la base de datos."
            });
        }

        res.status(500).json({
            error: "Internal Server Error",
            message: "Error al actualizar el producto en la base de datos."
        });
    }
});

// =====================================================================
// ENDPOINT 4: POST /api/auth/login (Tarea SCRUM-16)
// =====================================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Por favor provea un email y una contraseña."
            });
        }

        const userQuery = 'SELECT id_usuario, email, password_hash, rol, estado FROM usuarios WHERE email = $1';
        const { rows } = await pool.query(userQuery, [email]);

        if (rows.length === 0) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "Credenciales inválidas. Correo electrónico no encontrado."
            });
        }

        const usuario = rows[0];

        if (usuario.estado === false) {
            return res.status(403).json({
                error: "Forbidden",
                message: "La cuenta de usuario se encuentra inactiva."
            });
        }

        const isPasswordValid = await bcrypt.compare(password, usuario.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "Credenciales inválidas. Contraseña incorrecta."
            });
        }

        const tokenPayload = {
            id: usuario.id_usuario,
            email: usuario.email,
            rol: usuario.rol
        };

        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({
            message: "Autenticación exitosa",
            token: token,
            user: {
                id: usuario.id_usuario,
                email: usuario.email,
                rol: usuario.rol
            }
        });

    } catch (error) {
        console.error('Error en el proceso de login:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Ocurrió un error inesperado durante la autenticación."
        });
    }
});

// =====================================================================
// ENDPOINT 5: POST /api/auth/logout (Tarea SCRUM-17)
// =====================================================================
app.post('/api/auth/logout', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            return res.status(400).json({
                error: "Bad Request",
                message: "No se proporcionó un token de autorización."
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Formato de token inválido."
            });
        }

        const insertBlacklistQuery = 'INSERT INTO jwt_blacklist (token) VALUES ($1)';

        try {
            await pool.query(insertBlacklistQuery, [token]);
        } catch (dbError) {
            if (dbError.code !== '23505') {
                throw dbError;
            }
        }

        res.status(200).json({
            message: "Cierre de sesión exitoso. El token ha sido invalidado."
        });

    } catch (error) {
        console.error('Error durante el logout:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Ocurrió un error al procesar el cierre de sesión."
        });
    }
});

// 1. Capturador para rutas inexistentes (Error 404)
app.use('*', (req, res, next) => {
    const error = new Error(`La ruta solicitada no existe: ${req.originalUrl}`);
    error.statusCode = 404;
    next(error); // Pasa el error al middleware global
});

// 2. Middleware Global de Manejo de Errores (DEBE SER EL ÚLTIMO app.use)
app.use(errorHandler);
// Iniciar procesos en segundo plano
iniciarLimpiezaDeReservas();

app.listen(port, () => {
    console.log(`Servidor de inventario corriendo en http://localhost:${port}`);
});