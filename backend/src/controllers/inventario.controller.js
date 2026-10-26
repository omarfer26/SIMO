// src/controllers/inventario.controller.js
// Módulo de inventario. HU-05 / CU-05: registrar ingreso de mercancía a Bodega.
const {
    buscarProductoPorSku,
    registrarIngresoBodega,
    registrarCompra,
    obtenerCompra,
    existenProductos,
    idsPorSku,
    registrarAjuste,
    obtenerKardex,
    resumenProductoKardex,
} = require('../repositories/inventario.repository');

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
    SM014: [409, 'Conflict'],
    SM015: [400, 'Bad Request'],
    SM016: [400, 'Bad Request'],
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

        // El responsable es el usuario de la sesión (token JWT), nunca el cuerpo de la petición
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
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

// =====================================================================
// POST /api/inventory/purchases (SCRUM-45)
// Body: { id_proveedor?, documento_referencia?, observacion?, confirmar? (true),
//         lineas: [{ id_producto | sku, cantidad, costo_unitario? }] }
// Registra la compra y, por defecto, la confirma: todas las líneas ingresan a
// Bodega en una sola operación (procedimiento sp_confirmar_compra).
// =====================================================================
const ERRORES_COMPRA = {
    ...ERRORES_NEGOCIO,
    SM011: [409, 'Conflict'],
    SM012: [404, 'Not Found'],
    SM013: [400, 'Bad Request'],
};

async function postCompra(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        const { id_proveedor, documento_referencia, observacion, lineas, confirmar = true } = req.body || {};

        if (typeof confirmar !== 'boolean') return badRequest(res, "El campo 'confirmar' debe ser true o false.");
        if (id_proveedor !== undefined && id_proveedor !== null && !REGEX_ENTERO_POSITIVO.test(String(id_proveedor))) {
            return badRequest(res, 'El id_proveedor debe ser un entero positivo.');
        }
        for (const [campo, valor, maximo] of [['documento_referencia', documento_referencia, 100], ['observacion', observacion, 500]]) {
            if (valor !== undefined && valor !== null && (typeof valor !== 'string' || valor.length > maximo)) {
                return badRequest(res, `El campo ${campo} debe ser un texto de máximo ${maximo} caracteres.`);
            }
        }
        if (!Array.isArray(lineas) || lineas.length === 0 || lineas.length > 100) {
            return badRequest(res, 'La compra debe tener entre 1 y 100 líneas.');
        }

        // Validación y normalización de cada línea
        const skus = lineas.filter((l) => l && l.id_producto === undefined && typeof l.sku === 'string').map((l) => l.sku.trim());
        const mapaSku = skus.length ? await idsPorSku(skus) : new Map();
        const normalizadas = [];
        for (const [i, linea] of lineas.entries()) {
            const n = i + 1;
            if (!linea || typeof linea !== 'object') return badRequest(res, `La línea ${n} no es válida.`);
            let idProducto;
            if (linea.id_producto !== undefined) {
                if (!REGEX_ENTERO_POSITIVO.test(String(linea.id_producto))) return badRequest(res, `Línea ${n}: id_producto debe ser un entero positivo.`);
                idProducto = Number(linea.id_producto);
            } else if (typeof linea.sku === 'string' && linea.sku.trim()) {
                idProducto = mapaSku.get(linea.sku.trim());
                if (!idProducto) return res.status(404).json({ error: 'Not Found', message: `Línea ${n}: no existe un producto con el SKU ${linea.sku.trim()}.` });
            } else {
                return badRequest(res, `Línea ${n}: indique el producto con id_producto o sku.`);
            }
            const cantidad = aNumero(linea.cantidad);
            if (Number.isNaN(cantidad) || cantidad <= 0) return badRequest(res, `Línea ${n}: la cantidad debe ser mayor a cero.`);
            if (excedeDecimales(cantidad, 3) || cantidad > 999999999) return badRequest(res, `Línea ${n}: la cantidad admite máximo 3 decimales.`);
            let costoUnitario = null;
            if (linea.costo_unitario !== undefined && linea.costo_unitario !== null) {
                costoUnitario = aNumero(linea.costo_unitario);
                if (Number.isNaN(costoUnitario) || costoUnitario < 0 || excedeDecimales(costoUnitario, 2)) {
                    return badRequest(res, `Línea ${n}: el costo_unitario debe ser un número no negativo con máximo 2 decimales.`);
                }
            }
            if (normalizadas.some((x) => x.idProducto === idProducto)) {
                return badRequest(res, `Línea ${n}: el producto está repetido; agrupe las cantidades en una sola línea.`);
            }
            normalizadas.push({ idProducto, cantidad, costoUnitario });
        }
        const existentes = await existenProductos(normalizadas.map((l) => l.idProducto));
        const faltante = normalizadas.find((l) => !existentes.has(l.idProducto));
        if (faltante) {
            return res.status(404).json({ error: 'Not Found', message: `El producto ${faltante.idProducto} no existe.` });
        }

        const idCompra = await registrarCompra({
            idProveedor: id_proveedor ? Number(id_proveedor) : null,
            documentoReferencia: documento_referencia ?? null,
            observacion: observacion ?? null,
            lineas: normalizadas,
            idUsuario: Number(idUsuario),
            confirmar,
        });
        const compra = await obtenerCompra(idCompra);
        return res.status(201).json({
            message: confirmar ? 'Compra confirmada: la mercancía ingresó a Bodega' : 'Compra registrada en borrador',
            compra,
        });
    } catch (error) {
        const negocio = ERRORES_COMPRA[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        if (error.code === '23503') {
            return badRequest(res, 'El proveedor indicado no existe.');
        }
        console.error('[POST /api/inventory/purchases] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar la compra.' });
    }
}

// =====================================================================
// GET /api/inventory/purchases/:id (SCRUM-45)
// =====================================================================
async function getCompra(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id de la compra debe ser un entero positivo.');
        }
        const compra = await obtenerCompra(Number(req.params.id));
        if (!compra) {
            return res.status(404).json({ error: 'Not Found', message: `No existe la compra con id ${req.params.id}.` });
        }
        return res.status(200).json(compra);
    } catch (error) {
        console.error('[GET /api/inventory/purchases/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar la compra.' });
    }
}

// =====================================================================
// POST /api/inventory/adjustments (SCRUM-42, contrato del frontend SCRUM-38)
// Body: { id_producto, tipo_movimiento: AJUSTE_POSITIVO | AJUSTE_NEGATIVO,
//         ubicacion: BODEGA | ALMACEN, cantidad, motivo, costo_unitario? }
// El responsable sale del token. 409 si no alcanza el stock de la ubicación.
// =====================================================================
const TIPOS_AJUSTE = ['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];
const UBICACIONES = ['BODEGA', 'ALMACEN'];

async function postAjuste(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        const { id_producto, tipo_movimiento, ubicacion, cantidad, costo_unitario } = req.body || {};
        // "justificacion" se acepta como sinónimo de "motivo"
        const motivo = req.body?.motivo ?? req.body?.justificacion;

        if (!REGEX_ENTERO_POSITIVO.test(String(id_producto ?? ''))) {
            return badRequest(res, 'El id_producto es obligatorio y debe ser un entero positivo.');
        }
        const tipo = typeof tipo_movimiento === 'string' ? tipo_movimiento.trim().toUpperCase() : '';
        if (!TIPOS_AJUSTE.includes(tipo)) {
            return badRequest(res, 'El tipo_movimiento debe ser AJUSTE_POSITIVO o AJUSTE_NEGATIVO.');
        }
        const lugar = typeof ubicacion === 'string' ? ubicacion.trim().toUpperCase() : '';
        if (!UBICACIONES.includes(lugar)) {
            return badRequest(res, 'La ubicacion debe ser BODEGA o ALMACEN.');
        }
        const cantidadNumero = aNumero(cantidad);
        if (Number.isNaN(cantidadNumero)) {
            return badRequest(res, 'La cantidad es obligatoria y debe ser numérica.');
        }
        if (cantidadNumero <= 0) {
            return badRequest(res, 'La cantidad del ajuste debe ser mayor a cero.');
        }
        if (excedeDecimales(cantidadNumero, 3) || cantidadNumero > 999999999) {
            return badRequest(res, 'La cantidad admite máximo 3 decimales y 9 dígitos enteros.');
        }
        if (typeof motivo !== 'string' || !motivo.trim()) {
            return badRequest(res, 'El motivo del ajuste es obligatorio.');
        }
        if (motivo.length > 500) {
            return badRequest(res, 'El motivo admite máximo 500 caracteres.');
        }
        let costoNumero = null;
        if (costo_unitario !== undefined && costo_unitario !== null) {
            costoNumero = aNumero(costo_unitario);
            if (Number.isNaN(costoNumero) || costoNumero < 0 || excedeDecimales(costoNumero, 2)) {
                return badRequest(res, 'El costo_unitario debe ser un número no negativo con máximo 2 decimales.');
            }
        }

        const a = await registrarAjuste({
            idProducto: Number(id_producto),
            tipo,
            ubicacion: lugar,
            cantidad: cantidadNumero,
            motivo: motivo.trim(),
            idUsuario: Number(idUsuario),
            costoUnitario: costoNumero,
        });

        return res.status(201).json({ message: 'Ajuste registrado', ajuste: a });
    } catch (error) {
        const negocio = ERRORES_NEGOCIO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        console.error('[POST /api/inventory/adjustments] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar el ajuste.' });
    }
}

// =====================================================================
// GET /api/inventory/kardex/:id_producto (SCRUM-43, contrato del frontend SCRUM-39)
// Query opcional: desde, hasta (AAAA-MM-DD, inclusivos, hora de Colombia, o
// fecha y hora ISO 8601). Sin filtros devuelve el historial completo.
// Los saldos no cambian al filtrar: se calculan desde el primer movimiento.
// =====================================================================
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Convierte el parámetro a un instante; las fechas sin hora se toman en hora
// de Colombia (UTC-5) al inicio o al final del día.
function aInstante(valor, finDelDia) {
    if (valor === undefined || valor === '') return null;
    if (typeof valor !== 'string') return undefined;
    if (REGEX_FECHA.test(valor)) {
        // Rechaza días que no existen (2026-02-30), que Date convertiría al mes siguiente
        const [a, m, d] = valor.split('-').map(Number);
        const calendario = new Date(Date.UTC(a, m - 1, d));
        if (calendario.getUTCFullYear() !== a || calendario.getUTCMonth() !== m - 1 || calendario.getUTCDate() !== d) {
            return undefined;
        }
        return new Date(`${valor}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}-05:00`);
    }
    const d = new Date(valor);
    return /^\d{4}-\d{2}-\d{2}T/.test(valor) && !Number.isNaN(d.getTime()) ? d : undefined;
}

async function getKardex(req, res) {
    try {
        const { id_producto } = req.params;
        if (!REGEX_ENTERO_POSITIVO.test(String(id_producto))) {
            return badRequest(res, 'El id_producto debe ser un entero positivo.');
        }
        const desde = aInstante(req.query.desde, false);
        const hasta = aInstante(req.query.hasta, true);
        if (desde === undefined || hasta === undefined) {
            return badRequest(res, 'Los filtros desde y hasta deben tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        if (desde && hasta && desde > hasta) {
            return badRequest(res, 'La fecha desde no puede ser posterior a hasta.');
        }

        const producto = await resumenProductoKardex(Number(id_producto));
        if (!producto) {
            return res.status(404).json({ error: 'Not Found', message: `El producto ${id_producto} no existe.` });
        }
        const movimientos = await obtenerKardex(Number(id_producto), desde, hasta);
        return res.status(200).json({ producto, movimientos });
    } catch (error) {
        if (error.code === 'SM001') {
            return res.status(404).json({ error: 'Not Found', message: `${error.message}.` });
        }
        console.error('[GET /api/inventory/kardex] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar el Kardex.' });
    }
}

module.exports = { postIngresoBodega, postCompra, getCompra, postAjuste, getKardex };
