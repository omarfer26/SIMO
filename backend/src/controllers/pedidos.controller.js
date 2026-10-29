// src/controllers/pedidos.controller.js
// Pedidos de clientes (HU-10, CU-12). SCRUM-81: registro y consulta.
const {
    crearPedido,
    obtenerPedido,
    listarPedidos,
    cambiarEstadoPedido,
    convertirEnVenta,
    buscarMetodoPago,
    obtenerVentaDePedido,
    estadoCliente,
} = require('../repositories/pedidos.repository');
const { existenProductos, idsPorSku } = require('../repositories/inventario.repository');
const { aInstante } = require('../utils/fechas');
const { aNumero, excedeDecimales, REGEX_ENTERO_POSITIVO } = require('../utils/numeros');

const ESTADOS = ['REGISTRADO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO'];

// Errores de las reglas de la base (migraciones 004 y 015) -> HTTP
const ERRORES_PEDIDO = {
    SM002: [409, 'Conflict'],
    SM004: [400, 'Bad Request'],
    SM015: [400, 'Bad Request'],
    SM017: [409, 'Conflict'],
    SM018: [404, 'Not Found'],
    SM019: [409, 'Conflict'],
    SM020: [409, 'Conflict'],
    SM021: [409, 'Conflict'],
    SM022: [400, 'Bad Request'],
    SM023: [400, 'Bad Request'],
    // Transición fuera del ciclo (trigger fn_validar_transicion_pedido, 004)
    23514: [409, 'Conflict'],
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

// =====================================================================
// PATCH /api/orders/:id/status (SCRUM-61, contrato del frontend SCRUM-58/125)
// Body: { estado, motivo? }. El ciclo es REGISTRADO -> CONFIRMADO ->
// EN_PREPARACION -> LISTO -> ENTREGADO, un paso a la vez; CANCELADO desde
// cualquier estado antes de ENTREGADO y con motivo obligatorio.
// Al pasar a EN_PREPARACION se descuenta el stock (Almacén y luego Bodega);
// al cancelar un pedido que ya descontó, el stock vuelve a su ubicación.
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
        const estado = typeof req.body?.estado === 'string' ? req.body.estado.trim().toUpperCase() : '';
        if (!ESTADOS.includes(estado) || estado === 'REGISTRADO') {
            return badRequest(res, `El estado debe ser uno de: ${ESTADOS.filter((e) => e !== 'REGISTRADO').join(', ')}.`);
        }
        const motivo = req.body?.motivo;
        if (motivo !== undefined && motivo !== null && (typeof motivo !== 'string' || motivo.length > 500)) {
            return badRequest(res, 'El motivo debe ser un texto de máximo 500 caracteres.');
        }
        if (estado === 'CANCELADO' && (typeof motivo !== 'string' || !motivo.trim())) {
            return badRequest(res, 'Para cancelar un pedido debe indicar el motivo.');
        }

        const resultado = await cambiarEstadoPedido({
            idPedido: Number(req.params.id),
            estado,
            idUsuario: Number(idUsuario),
            motivo: typeof motivo === 'string' ? motivo.trim() : null,
        });
        const pedido = await obtenerPedido(resultado.id_pedido);
        const mensajes = {
            EN_PREPARACION: 'Pedido en preparación: el stock fue descontado',
            CANCELADO: 'Pedido cancelado',
        };
        return res.status(200).json({
            message: mensajes[estado] || 'Estado del pedido actualizado',
            id_pedido: pedido.id_pedido,
            estado: pedido.estado,
            pedido,
        });
    } catch (error) {
        const negocio = ERRORES_PEDIDO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        console.error('[PATCH /api/orders/:id/status] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al cambiar el estado del pedido.' });
    }
}

// =====================================================================
// POST /api/orders/:id/convert-to-sale (SCRUM-62, HU-12)
// Body: { metodo_pago: "EFECTIVO" | "NEQUI" | ... (o id_metodo_pago), descuento? }
// Convierte un pedido ENTREGADO en venta con sus mismas líneas. No mueve
// stock: ya se descontó al preparar el pedido. Precios con IVA incluido
// (impuestos 0), igual que el POS.
// =====================================================================
async function postConvertirEnVenta(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del pedido debe ser un entero positivo.');
        }
        const { metodo_pago, id_metodo_pago, descuento } = req.body || {};
        let metodo = null;
        if (typeof metodo_pago === 'string' && metodo_pago.trim()) {
            metodo = await buscarMetodoPago({ codigo: metodo_pago.trim().toUpperCase() });
        } else if (id_metodo_pago !== undefined && id_metodo_pago !== null) {
            if (!REGEX_ENTERO_POSITIVO.test(String(id_metodo_pago))) return badRequest(res, 'El id_metodo_pago debe ser un entero positivo.');
            metodo = await buscarMetodoPago({ id: Number(id_metodo_pago) });
        } else {
            return badRequest(res, 'Indique el método de pago (metodo_pago o id_metodo_pago).');
        }
        if (!metodo) {
            return badRequest(res, 'El método de pago no existe o está inactivo.');
        }
        let descuentoNumero = 0;
        if (descuento !== undefined && descuento !== null && descuento !== '') {
            descuentoNumero = aNumero(descuento);
            if (Number.isNaN(descuentoNumero) || descuentoNumero < 0 || excedeDecimales(descuentoNumero, 2)) {
                return badRequest(res, 'El descuento debe ser un número no negativo con máximo 2 decimales.');
            }
        }

        const idVenta = await convertirEnVenta({
            idPedido: Number(req.params.id),
            idUsuario: Number(idUsuario),
            idMetodoPago: metodo.id_metodo_pago,
            descuento: descuentoNumero,
        });
        const venta = await obtenerVentaDePedido(idVenta);
        return res.status(201).json({ message: `Pedido ${req.params.id} convertido en la venta ${idVenta}`, venta });
    } catch (error) {
        const negocio = ERRORES_PEDIDO[error.code];
        if (negocio) {
            const [status, nombre] = negocio;
            return res.status(status).json({ error: nombre, message: `${error.message}.` });
        }
        // Dos conversiones simultáneas: la segunda choca con ventas.id_pedido UNIQUE
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Conflict', message: 'El pedido ya se convirtió en venta.' });
        }
        console.error('[POST /api/orders/:id/convert-to-sale] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al convertir el pedido en venta.' });
    }
}

module.exports = { postPedido, getPedidos, getPedido, patchEstadoPedido, postConvertirEnVenta };
