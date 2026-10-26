// src/controllers/pedidos.controller.js
// Pedidos de clientes (HU-10, CU-12). SCRUM-81: registro y consulta.
const { crearPedido, obtenerPedido, listarPedidos, estadoCliente } = require('../repositories/pedidos.repository');
const { existenProductos, idsPorSku } = require('../repositories/inventario.repository');
const { aInstante } = require('../utils/fechas');
const { aNumero, excedeDecimales, REGEX_ENTERO_POSITIVO } = require('../utils/numeros');

const ESTADOS = ['REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO'];

// Errores de las reglas de la base (migraciones 004 y 015) -> HTTP
const ERRORES_PEDIDO = {
    SM002: [409, 'Conflict'],
    SM004: [400, 'Bad Request'],
    SM017: [409, 'Conflict'],
};

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

// =====================================================================
// POST /api/orders (SCRUM-81)
// Body: { id_cliente, fecha_entrega_pactada, direccion_entrega?, observaciones?,
//         lineas: [{ id_producto | sku, cantidad }] }
// El pedido nace REGISTRADO; el precio de cada línea es el precio de venta
// vigente del producto. Quien registra sale del token.
// =====================================================================
async function postPedido(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        const { id_cliente, fecha_entrega_pactada, direccion_entrega, observaciones, lineas } = req.body || {};

        if (!REGEX_ENTERO_POSITIVO.test(String(id_cliente ?? ''))) {
            return badRequest(res, 'El id_cliente es obligatorio y debe ser un entero positivo.');
        }
        if (fecha_entrega_pactada === undefined || fecha_entrega_pactada === null || fecha_entrega_pactada === '') {
            return badRequest(res, 'La fecha_entrega_pactada es obligatoria.');
        }
        // Solo fecha: se pacta para el final de ese día (hora de Colombia)
        const entrega = aInstante(fecha_entrega_pactada, true);
        if (!entrega) {
            return badRequest(res, 'La fecha_entrega_pactada debe tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        if (entrega < new Date()) {
            return badRequest(res, 'La fecha de entrega pactada no puede estar en el pasado.');
        }
        for (const [campo, valor, maximo] of [['direccion_entrega', direccion_entrega, 200], ['observaciones', observaciones, 1000]]) {
            if (valor !== undefined && valor !== null && (typeof valor !== 'string' || valor.length > maximo)) {
                return badRequest(res, `El campo ${campo} debe ser un texto de máximo ${maximo} caracteres.`);
            }
        }
        if (!Array.isArray(lineas) || lineas.length === 0 || lineas.length > 100) {
            return badRequest(res, 'El pedido debe tener entre 1 y 100 productos.');
        }

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
            if (normalizadas.some((x) => x.idProducto === idProducto)) {
                return badRequest(res, `Línea ${n}: el producto está repetido; agrupe las cantidades en una sola línea.`);
            }
            normalizadas.push({ idProducto, cantidad });
        }

        const estado = await estadoCliente(Number(id_cliente));
        if (estado === null) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el cliente con id ${id_cliente}.` });
        }
        if (estado === false) {
            return res.status(409).json({ error: 'Conflict', message: 'El cliente está inactivo.' });
        }
        const existentes = await existenProductos(normalizadas.map((l) => l.idProducto));
        const faltante = normalizadas.find((l) => !existentes.has(l.idProducto));
        if (faltante) {
            return res.status(404).json({ error: 'Not Found', message: `El producto ${faltante.idProducto} no existe.` });
        }

        const idPedido = await crearPedido({
            idCliente: Number(id_cliente),
            idUsuario: Number(idUsuario),
            fechaEntregaPactada: entrega,
            direccionEntrega: direccion_entrega?.trim() || null,
            observaciones: observaciones?.trim() || null,
            lineas: normalizadas,
        });
        const pedido = await obtenerPedido(idPedido);
        const sinStock = pedido.lineas.filter((l) => !l.disponible).map((l) => l.sku);
        return res.status(201).json({
            message: 'Pedido registrado',
            pedido,
            // Informativo: el stock se descuenta al pasar a EN_PREPARACION
            ...(sinStock.length ? { advertencia: `Hoy no alcanza el stock de: ${sinStock.join(', ')}.` } : {}),
        });
    } catch (error) {
        const negocio = ERRORES_PEDIDO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        console.error('[POST /api/orders] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar el pedido.' });
    }
}

// =====================================================================
// GET /api/orders?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&estado=&id_cliente=
// Contrato de la lista del frontend (SCRUM-125): { data: [...] }
// =====================================================================
async function getPedidos(req, res) {
    try {
        const desde = aInstante(req.query.desde, false);
        const hasta = aInstante(req.query.hasta, true);
        if (desde === undefined || hasta === undefined) {
            return badRequest(res, 'Los filtros desde y hasta deben tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        if (desde && hasta && desde > hasta) {
            return badRequest(res, 'La fecha desde no puede ser posterior a hasta.');
        }
        let estado;
        if (req.query.estado !== undefined) {
            estado = String(req.query.estado).trim().toUpperCase();
            if (!ESTADOS.includes(estado)) return badRequest(res, `El estado debe ser uno de: ${ESTADOS.join(', ')}.`);
        }
        let idCliente;
        if (req.query.id_cliente !== undefined) {
            if (!REGEX_ENTERO_POSITIVO.test(String(req.query.id_cliente))) return badRequest(res, 'El id_cliente debe ser un entero positivo.');
            idCliente = Number(req.query.id_cliente);
        }
        const data = await listarPedidos({ desde, hasta, estado, idCliente });
        return res.status(200).json({ data });
    } catch (error) {
        console.error('[GET /api/orders] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar los pedidos.' });
    }
}

// GET /api/orders/:id — pedido con sus líneas y el historial de estados
async function getPedido(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del pedido debe ser un entero positivo.');
        }
        const pedido = await obtenerPedido(Number(req.params.id));
        if (!pedido) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el pedido ${req.params.id}.` });
        }
        return res.status(200).json({ pedido });
    } catch (error) {
        console.error('[GET /api/orders/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar el pedido.' });
    }
}

module.exports = { postPedido, getPedidos, getPedido };
