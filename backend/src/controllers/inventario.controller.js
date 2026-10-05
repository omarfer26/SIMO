// src/controllers/inventario.controller.js
// Módulo de inventario. HU-05 / CU-05: registrar ingreso de mercancía a Bodega.
const { buscarProductoPorSku, registrarIngresoBodega } = require('../repositories/inventario.repository');

const REGEX_ENTERO_POSITIVO = /^[1-9]\d*$/;

// Errores de negocio de fn_registrar_ingreso_bodega (SQLSTATE clase SM) -> HTTP
const ERRORES_NEGOCIO = {
    SM001: [404, 'Not Found'],
    SM002: [409, 'Conflict'],
    SM003: [400, 'Bad Request'],
    SM004: [400, 'Bad Request'],
    SM005: [400, 'Bad Request'],
    SM006: [400, 'Bad Request'],
    SM007: [400, 'Bad Request'],
};

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

// Acepta números o texto numérico ("12.5"); rechaza vacíos, NaN e infinitos.
function aNumero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
    if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
    return NaN;
}

// true si el número tiene más de `maximo` decimales (tolera el error binario
// de punto flotante y la notación científica, p. ej. 1e-7).
function excedeDecimales(numero, maximo) {
    const escalado = numero * 10 ** maximo;
    return Math.abs(escalado - Math.round(escalado)) > 1e-6;
}

// =====================================================================
// POST /api/inventory/entries (SCRUM-94 / HU-05)
// Body: id_producto o sku, cantidad, y opcionales costo_unitario,
//       id_proveedor, documento_referencia, observacion.
// =====================================================================
async function postIngresoBodega(req, res) {
    try {
        const {
            id_producto, sku, cantidad, costo_unitario, id_proveedor, documento_referencia, observacion,
        } = req.body || {};

        // El responsable saldrá del token JWT (SCRUM-16/18). Mientras no exista
        // el login, se recibe en el cuerpo de la petición.
        const idUsuario = req.user?.id_usuario ?? req.body?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return badRequest(res, 'Debe indicar el usuario responsable del ingreso (id_usuario).');
        }

        if (id_producto === undefined && (typeof sku !== 'string' || !sku.trim())) {
            return badRequest(res, 'Debe indicar el producto mediante id_producto o sku.');
        }
        if (id_producto !== undefined && !REGEX_ENTERO_POSITIVO.test(String(id_producto))) {
            return badRequest(res, 'El id_producto debe ser un entero positivo.');
        }

        const cantidadNumero = aNumero(cantidad);
        if (Number.isNaN(cantidadNumero)) {
            return badRequest(res, 'La cantidad es obligatoria y debe ser numérica.');
        }
        if (cantidadNumero <= 0) {
            return badRequest(res, 'La cantidad ingresada debe ser mayor a cero.');
        }
        if (excedeDecimales(cantidadNumero, 3) || cantidadNumero > 999999999) {
            return badRequest(res, 'La cantidad admite máximo 3 decimales y 9 dígitos enteros.');
        }

        let costoNumero = null;
        if (costo_unitario !== undefined && costo_unitario !== null) {
            costoNumero = aNumero(costo_unitario);
            if (Number.isNaN(costoNumero) || costoNumero < 0 || excedeDecimales(costoNumero, 2)) {
                return badRequest(res, 'El costo_unitario debe ser un número no negativo con máximo 2 decimales.');
            }
        }
        if (id_proveedor !== undefined && id_proveedor !== null && !REGEX_ENTERO_POSITIVO.test(String(id_proveedor))) {
            return badRequest(res, 'El id_proveedor debe ser un entero positivo.');
        }
        for (const [campo, valor, maximo] of [['documento_referencia', documento_referencia, 100], ['observacion', observacion, 500]]) {
            if (valor !== undefined && valor !== null && (typeof valor !== 'string' || valor.length > maximo)) {
                return badRequest(res, `El campo ${campo} debe ser un texto de máximo ${maximo} caracteres.`);
            }
        }

        let idProducto = id_producto !== undefined ? Number(id_producto) : null;
        if (idProducto === null) {
            const producto = await buscarProductoPorSku(sku.trim());
            if (!producto) {
                return res.status(404).json({ error: 'Not Found', message: `No existe un producto con el SKU ${sku.trim()}.` });
            }
            idProducto = producto.id_producto;
        }

        const r = await registrarIngresoBodega({
            idProducto,
            cantidad: cantidadNumero,
            idUsuario: Number(idUsuario),
            costoUnitario: costoNumero,
            idProveedor: id_proveedor ? Number(id_proveedor) : null,
            documentoReferencia: documento_referencia ?? null,
            observacion: observacion ?? null,
        });

        return res.status(201).json({
            message: 'Ingreso a Bodega registrado exitosamente',
            movimiento: {
                id_movimiento: r.id_movimiento,
                tipo_movimiento: r.tipo_movimiento,
                ubicacion_destino: r.ubicacion_destino,
                cantidad: r.cantidad,
                costo_unitario: r.costo_unitario,
                saldo_bodega: r.saldo_bodega,
                saldo_almacen: r.saldo_almacen,
                id_usuario: r.id_usuario,
                id_proveedor: r.id_proveedor,
                documento_referencia: r.documento_referencia,
                observacion: r.observacion,
                fecha_movimiento: r.fecha_movimiento,
            },
            producto: {
                id_producto: r.id_producto,
                sku: r.sku,
                nombre: r.nombre,
                stock_bodega: r.stock_bodega,
                stock_almacen: r.stock_almacen,
                stock_total: r.stock_total,
            },
        });
    } catch (error) {
        const negocio = ERRORES_NEGOCIO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        console.error('[POST /api/inventory/entries] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar el ingreso a Bodega.' });
    }
}

module.exports = { postIngresoBodega };
