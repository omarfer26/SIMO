// backend/middleware/auditInterceptor.js
const pool = require('../db');

const auditInterceptor = (req, res, next) => {
    // Guardar la función json original
    const originalJson = res.json;

    // Sobrescribir res.json para interceptar la respuesta antes de que termine
    res.json = function (data) {
        // Ejecutar el envío del JSON original al cliente
        originalJson.call(this, data);

        // Si la petición fue exitosa (Códigos 200 a 299) y existe un usuario autenticado
        if (res.statusCode >= 200 && res.statusCode < 300 && req.usuario) {
            registrarAuditoria(req);
        }
    };

    next();
};

// Función auxiliar que clasifica y guarda el evento en PostgreSQL
const registrarAuditoria = (req) => {
    const { method, originalUrl, usuario, body } = req;
    let accion = null;
    let detalle = '';

    // 1. Detectar anulación de venta
    if ((originalUrl.includes('/cancel') || originalUrl.includes('/annul')) && (method === 'PUT' || method === 'POST')) {
        accion = 'ANULACION_VENTA';
        // Extrae el ID de la venta desde la URL (ej. /api/sales/5/annul)
        const idVenta = originalUrl.split('/')[3];
        detalle = `Se anuló la venta con ID: ${idVenta}`;
    }
    // 2. Detectar cambio de precios
    else if (originalUrl.includes('/price') && method === 'PUT') {
        accion = 'CAMBIO_PRECIO';
        const idProducto = originalUrl.split('/')[3];
        detalle = `Producto ID: ${idProducto} | Nuevo Precio: $${body.precio}`;
    }
    // 3. Detectar ajuste manual de inventario
    else if (originalUrl.includes('/adjust') && method === 'PUT') {
        accion = 'AJUSTE_MANUAL';
        const idProducto = originalUrl.split('/')[3];
        detalle = `Producto ID: ${idProducto} | Nueva Cantidad: ${body.cantidad} | Motivo: ${body.motivo || 'N/A'}`;
    }

    // Si la ruta coincide con una de las acciones auditables, se inserta en la base de datos
    if (accion) {
        const query = `
            INSERT INTO log_auditoria (id_usuario, accion, detalle) 
            VALUES ($1, $2, $3)
        `;
        // Se ejecuta la consulta sin 'await' para no bloquear el hilo principal de Node.js
        pool.query(query, [usuario.id_usuario, accion, detalle])
            .catch(error => console.error('[Auditoría Error] Fallo al guardar en log_auditoria:', error));
    }
};

module.exports = auditInterceptor;