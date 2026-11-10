const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const JWT = require('./src/config/jwt'); // clave y expiración compartidas con el middleware
const pool = require('./db');
const errorHandler = require('./middleware/errorHandler');
const iniciarAuditoriaPedidos = require('./cron/auditarPedidos'); // SCRUM-69

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
// Reemplaza xss-clean (incompatible con Express 5). Se usa la versión de
// middleware/: escapa solo < y >. La de src/middleware escapaba también / ' " &,
// lo que alteraba contraseñas, direcciones y URLs antes de guardarlas.
const { sanitizarXss } = require('./middleware/sanitizarXss');

const usuariosRoutes = require('./src/routes/usuarios.routes');     // SCRUM-22/23/24/25
const productosRoutes = require('./src/routes/productos.routes');   // SCRUM-33/34/35 / HU-04
const inventarioRoutes = require('./src/routes/inventario.routes'); // HU-05, HU-06, SCRUM-42/43/45
const clientesRoutes = require('./src/routes/clientes.routes');     // SCRUM-98 / HU-09
const pedidosRoutes = require('./src/routes/pedidos.routes');       // HU-10, HU-11, HU-12
const ventasRoutes = require('./src/routes/ventas.routes');         // HU-07, CU-11 (SCRUM-53/54)
const pagosRoutes = require('./src/routes/pagos.routes');           // SCRUM-78
const dashboardRoutes = require('./src/routes/dashboard.routes');   // SCRUM-67/68
const reportesRoutes = require('./src/routes/reportes.routes');     // SCRUM-76
const auditoriaRoutes = require('./src/routes/auditoria.routes');   // HU-15 / SCRUM-77

// Reservas (routes/reservasRoutes.js y limpiarReservas.js) siguen desactivadas:
// usan productos.stock y las tablas reservas_stock/detalles_reserva, que no
// existen. La reserva de stock la hace el pedido al pasar a EN_PREPARACION
// (fn_cambiar_estado_pedido, migraciones 016 y 018).

const app = express();
// Detrás del proxy de Railway/Render/Cloudflare la IP real del cliente llega en
// X-Forwarded-For. Sin esto el límite de peticiones contaría a todos los
// usuarios como una sola IP (la del proxy).
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
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

// Aplicar el limitador a todas las rutas de la API (antes de montarlas)
app.use('/api', limiter);

// =====================================================================
// ENRUTADORES
// =====================================================================
app.use('/api/users', usuariosRoutes);
app.use('/api/products', productosRoutes);
app.use('/api/inventory', inventarioRoutes);
app.use('/api/customers', clientesRoutes);
app.use('/api/orders', pedidosRoutes);
app.use('/api/sales', ventasRoutes);
app.use('/api/payments', pagosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportesRoutes);
app.use('/api/audit', auditoriaRoutes);

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

        // jwtid único: sin él, dos inicios de sesión del mismo usuario en el mismo
        // segundo daban el mismo token, y cerrar uno invalidaba también el otro.
        const token = jwt.sign(tokenPayload, JWT.SECRETO, { expiresIn: JWT.EXPIRACION, jwtid: randomUUID() });

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

// 1. Capturador para rutas inexistentes (Error 404)
// (Camilo, 2026-10-20) — Sin '*': en Express 5 app.use('*', ...) tumba la API
// al arrancar ("Missing parameter name"). Sin ruta, app.use ya atrapa todo.
app.use((req, res, next) => {
    const error = new Error(`La ruta solicitada no existe: ${req.originalUrl}`);
    error.statusCode = 404;
    next(error); // Pasa el error al middleware global
});

// 2. Middleware Global de Manejo de Errores (DEBE SER EL ÚLTIMO app.use)
app.use(errorHandler);

// Tarea programada de medianoche: pedidos vencidos (SCRUM-69)
iniciarAuditoriaPedidos();

app.listen(port, () => {
    console.log(`Servidor de inventario corriendo en http://localhost:${port}`);
});
