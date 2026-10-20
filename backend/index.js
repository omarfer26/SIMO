// index.js (Parte superior)
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt'); // Requerido para el punto 1 y 2
const jwt = require('jsonwebtoken'); // Requerido para el punto 1
const pool = require('./db'); // Requerido para el punto 1 (ajusta la ruta según tu proyecto)
const usuariosRoutes = require('./routes/usuariosRoutes'); // Requerido para el punto 1

const app = express();
// Cambiamos el puerto al 3001 para liberar el 3000 que usa Next.js
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json()); // Permite a Express leer el cuerpo (body) de las peticiones en formato JSON

// Estado del servicio: lo usan Docker (healthcheck) y el monitoreo del despliegue
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
    } catch (error) {
        res.status(503).json({ status: 'error', database: 'unavailable' });
    }
});

// Módulo de usuarios (SCRUM-22, SCRUM-23)
app.use('/api/users', usuariosRoutes);

// =====================================================================
// ENDPOINT 1: POST /api/products (Tarea SCRUM-33)
// Guardar producto con validación de precio de venta > precio de compra
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

        // Validación de Negocio
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
                message: "Faltan campos obligatorios (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)."
            });
        }

        const insertQuery = `
      INSERT INTO productos 
      (id_categoria, codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock_minimo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
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
            stock_minimo || 5 // Por defecto 5 si no lo envían, acorde a nuestra DB
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
// Consulta paginada con filtrado SQL optimizado por código y nombre
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
// Actualización técnica de atributos de un producto existente
// =====================================================================
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Validar que el ID enviado en la URL sea un número válido
        if (isNaN(id)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "El ID del producto debe ser un valor numérico entero."
            });
        }

        // 2. Comprobar si el producto existe previamente en la BD
        const productCheck = await pool.query('SELECT * FROM productos WHERE id_producto = $1', [id]);
        if (productCheck.rows.length === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: `No existe ningún producto con el ID ${id}.`
            });
        }

        const productoActual = productCheck.rows[0];

        // 3. Extraer atributos a actualizar desde el body
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

        // 4. Evaluar los precios finales (nuevos o existentes) para la regla de negocio
        const finalPrecioCompra = precio_compra !== undefined ? parseFloat(precio_compra) : parseFloat(productoActual.precio_compra);
        const finalPrecioVenta = precio_venta !== undefined ? parseFloat(precio_venta) : parseFloat(productoActual.precio_venta);

        if (finalPrecioVenta <= finalPrecioCompra) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Regla de negocio no cumplida: El precio de venta debe ser obligatoriamente superior al precio de compra."
            });
        }

        // 5. Ejecutar la consulta SQL UPDATE
        // COALESCE ($1, campo) mantendrá el valor actual si la variable se envía como NULL
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

        // 6. Responder con éxito y el objeto actualizado
        res.status(200).json({
            message: "Producto actualizado exitosamente",
            producto: productoActualizado
        });

    } catch (error) {
        console.error('Error al actualizar producto:', error);

        // Captura de código de barras duplicado
        if (error.code === '23505') {
            return res.status(409).json({
                error: "Conflict",
                message: "El código de barras ingresado ya pertenece a otro producto."
            });
        }

        // Captura de categoría inexistente
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
// Verificación de credenciales con BCrypt y generación de JWT
// =====================================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        // 1. Extraer credenciales del cuerpo de la petición
        const { email, password } = req.body;

        // Validar que se envíen los datos requeridos
        if (!email || !password) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Por favor provea un email y una contraseña."
            });
        }

        // 2. Buscar al usuario en la base de datos por su email
        // (Asumimos que tienes una tabla 'usuarios' con columnas 'email' y 'password_hash')
        const userQuery = 'SELECT id_usuario, email, password_hash, rol, estado FROM usuarios WHERE email = $1';
        const { rows } = await pool.query(userQuery, [email]);

        // Si el usuario no existe, devolvemos 401 Unauthorized
        if (rows.length === 0) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "Credenciales inválidas. Correo electrónico no encontrado."
            });
        }

        const usuario = rows[0];

        // Validar que el usuario no esté inactivo o suspendido
        if (usuario.estado === false) {
            return res.status(403).json({
                error: "Forbidden",
                message: "La cuenta de usuario se encuentra inactiva."
            });
        }

        // 3. Verificar la contraseña usando BCrypt
        // Compara el password en texto plano enviado por el cliente 
        // con el password_hash encriptado guardado en la BD
        const isPasswordValid = await bcrypt.compare(password, usuario.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                error: "Unauthorized",
                message: "Credenciales inválidas. Contraseña incorrecta."
            });
        }

        // 4. Generar el Token JWT
        // Creamos el Payload (la información que viajará dentro del token)
        // NUNCA pongas contraseñas u otra información sensible aquí.
        const tokenPayload = {
            id: usuario.id_usuario,
            email: usuario.email,
            rol: usuario.rol
        };

        // Firmamos el token con nuestra variable secreta del .env
        // y le damos un tiempo de expiración (ej: 8 horas)
        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // 5. Devolver respuesta exitosa al cliente
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
// Invalidar token JWT usando Blacklist en Base de Datos
// =====================================================================
app.post('/api/auth/logout', async (req, res) => {
    try {
        // 1. Extraer el token de la cabecera Authorization (Bearer Token)
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            return res.status(400).json({
                error: "Bad Request",
                message: "No se proporcionó un token de autorización."
            });
        }

        // El formato suele ser "Bearer eyJhbGciOiJIUzI1NiIs..."
        // Separamos el string para obtener solo el token
        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Formato de token inválido."
            });
        }

        // 2. Insertar el token en la tabla de lista negra
        const insertBlacklistQuery = 'INSERT INTO jwt_blacklist (token) VALUES ($1)';

        try {
            await pool.query(insertBlacklistQuery, [token]);
        } catch (dbError) {
            // Si el token ya está en la lista negra (violación de UNIQUE), no hacemos nada
            // y simplemente respondemos que el logout fue exitoso.
            if (dbError.code !== '23505') {
                throw dbError; // Si es otro error de BD, lo lanzamos al catch principal
            }
        }

        // 3. Responder al cliente
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

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor de inventario corriendo en http://localhost:${port}`);
});

app.use('/api/users', usuariosRoutes);