const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT = require('./src/config/jwt'); // clave y expiración compartidas con el middleware
const pool = require('./db');
const usuariosRoutes = require('./src/routes/usuarios.routes'); // SCRUM-22/23/24 (contrato que usa el frontend)
const ventasRoutes = require('./routes/ventasRoutes');

// Módulos de seguridad (SCRUM-127)
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { sanitizarXss } = require('./src/middleware/sanitizarXss'); // reemplaza xss-clean (incompatible con Express 5)
const inventarioRoutes = require('./src/routes/inventario.routes'); // SCRUM-94 / HU-05
const clientesRoutes = require('./src/routes/clientes.routes'); // SCRUM-98 / HU-09

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
app.use(sanitizarXss);

// 3. Rate Limiting: Limitar a 100 peticiones por minuto por IP
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    // 100 por defecto; RATE_LIMIT_MAX permite subirlo en las pruebas de integración
    max: Number(process.env.RATE_LIMIT_MAX) || 100, // Límite máximo de peticiones
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too Many Requests",
        message: "Has superado el límite de peticiones permitidas. Por favor, intenta de nuevo en un minuto."
    }
});

// Aplicar el limitador a todas las rutas de la API
app.use('/api', limiter);

// =====================================================================
// ENRUTADORES
// =====================================================================
app.use('/api/sales', ventasRoutes);
app.use('/api/users', usuariosRoutes);
app.use('/api/inventory', inventarioRoutes); // SCRUM-94 / HU-05
app.use('/api/customers', clientesRoutes); // SCRUM-98 / HU-09

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
        // El frontend envía "email"; se acepta también "correo" (nombre de la columna)
        const correo = String(req.body?.email ?? req.body?.correo ?? '').trim().toLowerCase();
        const { password } = req.body || {};

        if (!correo || !password) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Por favor provea un email y una contraseña."
            });
        }

        const userQuery = `
            SELECT u.id_usuario, u.correo, u.nombre_completo, u.password_hash, u.estado,
                   u.id_rol, r.codigo AS rol
            FROM usuarios u
            JOIN roles r ON r.id_rol = u.id_rol
            WHERE u.correo = $1`;
        const { rows } = await pool.query(userQuery, [correo]);

        // CU-01 E-03: el mismo mensaje si falla el correo o la contraseña
        const credencialesInvalidas = () => res.status(401).json({
            error: "Unauthorized",
            message: "Correo o contraseña incorrectos."
        });

        if (rows.length === 0) {
            return credencialesInvalidas();
        }

        const usuario = rows[0];

        const isPasswordValid = await bcrypt.compare(password, usuario.password_hash);

        if (!isPasswordValid) {
            return credencialesInvalidas();
        }

        // CU-01 E-04: credenciales correctas pero cuenta inactiva
        if (usuario.estado === false) {
            return res.status(403).json({
                error: "Forbidden",
                message: "Su cuenta se encuentra inactiva. Comuníquese con el Administrador."
            });
        }

        const tokenPayload = {
            id_usuario: usuario.id_usuario,
            id_rol: usuario.id_rol,
            correo: usuario.correo,
            rol: usuario.rol
        };

        const token = jwt.sign(tokenPayload, JWT.SECRETO, { expiresIn: JWT.EXPIRACION });

        await pool.query('UPDATE usuarios SET ultimo_acceso = now() WHERE id_usuario = $1', [usuario.id_usuario]);

        res.status(200).json({
            message: "Autenticación exitosa",
            token: token,
            user: {
                id: usuario.id_usuario,
                email: usuario.correo,
                nombre_completo: usuario.nombre_completo,
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

// =====================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =====================================================================
app.listen(port, () => {
    console.log(`Servidor de inventario corriendo en http://localhost:${port}`);
});
