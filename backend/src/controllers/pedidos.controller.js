// src/controllers/pedidos.controller.js
// HU-10 / CU-12 / CU-13: gestionar pedidos avanzando secuencialmente por
// REGISTRADO -> CONFIRMADO -> EN_PREPARACION -> LISTO -> ENTREGADO, con
// reserva de stock al entrar en preparación y devolución al cancelar.
const {
    listarPedidos,
    obtenerPedido,
    obtenerCliente,
    obtenerProductos,
    registrarPedido,
    cambiarEstadoPedido,
} = require('../repositories/pedidos.repository');

const REGEX_ENTERO_POSITIVO = /^[1-9]\d*$/;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = ['REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO'];
const MAXIMO_LINEAS = 50;
const MOTIVO_MAXIMO = 500;
const DIRECCION_MAXIMA = 200;
const OBSERVACIONES_MAXIMA = 1000;
const ZONA_HORARIA = 'America/Bogota';

// Errores de negocio de las funciones de la BD (SQLSTATE clase SM) -> HTTP
const ERRORES_NEGOCIO = {
    SM001: [404, 'Not Found'],
    SM002: [409, 'Conflict'],
    SM005: [401, 'Unauthorized'],
    SM020: [404, 'Not Found'],
    SM021: [409, 'Conflict'],
    SM022: [409, 'Conflict'],
    SM023: [400, 'Bad Request'],
    SM024: [409, 'Conflict'],
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
// de punto flotante y la notación científica).
function excedeDecimales(numero, maximo) {
    const escalado = numero * 10 ** maximo;
    return Math.abs(escalado - Math.round(escalado)) > 1e-6;
}

// AAAA-MM-DD que exista de verdad (rechaza 2026-02-31 y similares).
function esFechaValida(texto) {
    if (typeof texto !== 'string' || !REGEX_FECHA.test(texto)) return false;
    const [anio, mes, dia] = texto.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    return (
        fecha.getUTCFullYear() === anio &&
        fecha.getUTCMonth() === mes - 1 &&
        fecha.getUTCDate() === dia
    );
}

// Día de hoy en Colombia, en formato AAAA-MM-DD, para no pactar entregas pasadas.
function hoyEnColombia() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
}

// Valida y normaliza las líneas del pedido.
function validarLineas(lineas) {
    if (!Array.isArray(lineas) || lineas.length === 0) {
        return { error: 'El pedido debe tener al menos una línea de producto.' };
    }
    if (lineas.length > MAXIMO_LINEAS) {
        return { error: `El pedido admite máximo ${MAXIMO_LINEAS} líneas.` };
    }

    const normalizadas = [];
    for (const [indice, linea] of lineas.entries()) {
        const n = indice + 1;
        if (!linea || typeof linea !== 'object') return { error: `La línea ${n} no es válida.` };
        if (!REGEX_ENTERO_POSITIVO.test(String(linea.id_producto ?? ''))) {
            return { error: `Línea ${n}: id_producto debe ser un entero positivo.` };
        }
        const idProducto = Number(linea.id_producto);
        const cantidad = aNumero(linea.cantidad);
        if (Number.isNaN(cantidad) || cantidad <= 0) {
            return { error: `Línea ${n}: la cantidad debe ser mayor a cero.` };
        }
        if (excedeDecimales(cantidad, 3) || cantidad > 999999999) {
            return { error: `Línea ${n}: la cantidad admite máximo 3 decimales.` };
        }
        if (normalizadas.some((l) => l.idProducto === idProducto)) {
            return { error: `Línea ${n}: el producto está repetido; agrupa las cantidades en una sola línea.` };
        }
        normalizadas.push({ idProducto, cantidad });
    }
    return { lineas: normalizadas };
}

// Texto opcional: "" o null se guardan como NULL; valida el largo máximo.
function textoOpcional(valor, maximo, campo) {
    if (valor === undefined || valor === null) return { valor: null };
    if (typeof valor !== 'string') return { error: `El campo ${campo} debe ser texto.` };
    const limpio = valor.trim();
    if (!limpio) return { valor: null };
    if (limpio.length > maximo) return { error: `El campo ${campo} admite máximo ${maximo} caracteres.` };
    return { valor: limpio };
}

// =====================================================================
// GET /api/orders?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
// =====================================================================
async function getPedidos(req, res) {
    try {
        const { desde, hasta } = req.query;

        if (desde !== undefined && !esFechaValida(desde)) {
            return badRequest(res, "El parámetro 'desde' debe ser una fecha AAAA-MM-DD válida.");
        }
        if (hasta !== undefined && !esFechaValida(hasta)) {
            return badRequest(res, "El parámetro 'hasta' debe ser una fecha AAAA-MM-DD válida.");
        }
        if (desde !== undefined && hasta !== undefined && desde > hasta) {
            return badRequest(res, "El rango de fechas está invertido: 'desde' no puede ser posterior a 'hasta'.");
        }

        const data = await listarPedidos({ desde, hasta });
        return res.status(200).json({ data });
    } catch (error) {
        console.error('[GET /api/orders] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al listar los pedidos.' });
    }
}

// =====================================================================
// GET /api/orders/:id
// =====================================================================
async function getPedidoPorId(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del pedido debe ser un entero positivo.');
        }
        const pedido = await obtenerPedido(Number(req.params.id));
        if (!pedido) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el pedido con id ${req.params.id}.` });
        }
        return res.status(200).json({ pedido });
    } catch (error) {
        console.error('[GET /api/orders/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar el pedido.' });
    }
}

// =====================================================================
// POST /api/orders  (CU-12: registrar un pedido, siempre nace REGISTRADO)
// Body: { id_cliente, fecha_entrega_pactada: "AAAA-MM-DD",
//         direccion_entrega?, observaciones?, lineas: [{ id_producto, cantidad }] }
// Si hoy no alcanza el stock se devuelve `advertencia`, pero NO se impide
// registrar: el stock se reserva al pasar a EN_PREPARACION.
// =====================================================================
async function postPedido(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }

        const body = req.body || {};

        if (!REGEX_ENTERO_POSITIVO.test(String(body.id_cliente ?? ''))) {
            return badRequest(res, 'El id_cliente debe ser un entero positivo.');
        }
        const idCliente = Number(body.id_cliente);

        // La fecha se pacta para el final del día elegido (hora de Colombia).
        if (!esFechaValida(body.fecha_entrega_pactada)) {
            return badRequest(res, "La fecha_entrega_pactada debe ser una fecha AAAA-MM-DD válida.");
        }
        if (body.fecha_entrega_pactada < hoyEnColombia()) {
            return badRequest(res, 'La fecha de entrega pactada no puede estar en el pasado.');
        }

        const direccion = textoOpcional(body.direccion_entrega, DIRECCION_MAXIMA, 'direccion_entrega');
        if (direccion.error) return badRequest(res, direccion.error);
        const observaciones = textoOpcional(body.observaciones, OBSERVACIONES_MAXIMA, 'observaciones');
        if (observaciones.error) return badRequest(res, observaciones.error);

        const { lineas, error: errorLineas } = validarLineas(body.lineas);
        if (errorLineas) return badRequest(res, errorLineas);

        const clientePedido = await obtenerCliente(idCliente);
        if (!clientePedido) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el cliente con id ${idCliente}.` });
        }
        if (!clientePedido.estado) {
            return res.status(409).json({
                error: 'Conflict',
                message: `El cliente ${clientePedido.nombre} está inactivo: no se le pueden registrar pedidos.`,
            });
        }

        const productos = await obtenerProductos(lineas.map((l) => l.idProducto));
        for (const linea of lineas) {
            const producto = productos.get(linea.idProducto);
            if (!producto) {
                return res.status(404).json({ error: 'Not Found', message: `No existe el producto con id ${linea.idProducto}.` });
            }
            if (!producto.estado) {
                return res.status(409).json({ error: 'Conflict', message: `El producto ${producto.nombre} está inactivo.` });
            }
        }

        // Advertencia informativa: stock actual insuficiente para el pedido completo.
        const faltantes = lineas
            .map((linea) => ({ producto: productos.get(linea.idProducto), cantidad: linea.cantidad }))
            .filter(({ producto, cantidad }) => Number(producto.stock_total) < cantidad)
            .map(({ producto, cantidad }) => `${producto.nombre} (hay ${Number(producto.stock_total)}, se piden ${cantidad})`);
        const advertencia = faltantes.length
            ? `Hoy no alcanza el stock de: ${faltantes.join('; ')}. El pedido se registra igual y el stock se reserva al pasar a preparación.`
            : null;

        const pedido = await registrarPedido({
            idCliente,
            idUsuario: Number(idUsuario),
            fechaEntregaPactada: body.fecha_entrega_pactada,
            direccionEntrega: direccion.valor,
            observaciones: observaciones.valor,
            lineas,
        });

        return res.status(201).json({ message: 'Pedido registrado exitosamente', pedido, advertencia });
    } catch (error) {
        const negocio = ERRORES_NEGOCIO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        if (error.code === '23503') {
            return badRequest(res, 'El cliente o alguno de los productos indicados ya no existe.');
        }
        if (error.code === '23514') {
            return badRequest(res, `${error.message}.`);
        }
        console.error('[POST /api/orders] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar el pedido.' });
    }
}

// =====================================================================
// PATCH /api/orders/:id/status  (HU-10 / CU-12 / CU-13)
// Body: { estado, motivo? }  — motivo obligatorio al cancelar.
// Solo el siguiente estado del ciclo (o CANCELADO antes de ENTREGADO).
// =====================================================================
async function patchEstadoPedido(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del pedido debe ser un entero positivo.');
        }
        const idPedido = Number(req.params.id);
        const body = req.body || {};

        const nuevoEstado = typeof body.estado === 'string' ? body.estado.trim().toUpperCase() : '';
        if (!ESTADOS.includes(nuevoEstado)) {
            return badRequest(res, `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
        }
        if (nuevoEstado === 'REGISTRADO') {
            return badRequest(res, 'El estado REGISTRADO solo se usa al registrar el pedido.');
        }

        // CU-13 EX-2: la cancelación siempre explica el motivo.
        let motivo = null;
        if (nuevoEstado === 'CANCELADO') {
            if (typeof body.motivo !== 'string' || !body.motivo.trim()) {
                return badRequest(res, 'El motivo de la cancelación es obligatorio.');
            }
            motivo = body.motivo.trim();
            if (motivo.length > MOTIVO_MAXIMO) {
                return badRequest(res, `El motivo admite máximo ${MOTIVO_MAXIMO} caracteres.`);
            }
        }

        const pedido = await cambiarEstadoPedido({
            idPedido,
            nuevoEstado,
            motivo,
            idUsuario: Number(idUsuario),
        });
        if (!pedido) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el pedido con id ${idPedido}.` });
        }

        return res.status(200).json({ message: 'Estado del pedido actualizado exitosamente', pedido });
    } catch (error) {
        const negocio = ERRORES_NEGOCIO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        // 23514: el trigger del ciclo de vida rechazó el salto o el retroceso,
        // o se canceló sin motivo. Su mensaje ya explica la regla.
        if (error.code === '23514') {
            return res.status(409).json({ error: 'Conflict', message: `${error.message}.` });
        }
        if (error.code === '23503') {
            return badRequest(res, 'El pedido referencia un cliente o usuario inexistente.');
        }
        console.error('[PATCH /api/orders/:id/status] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al cambiar el estado del pedido.' });
    }
}

module.exports = { getPedidos, getPedidoPorId, postPedido, patchEstadoPedido };
