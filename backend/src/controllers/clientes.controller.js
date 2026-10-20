// src/controllers/clientes.controller.js
// HU-09 / CU-09: registrar, consultar, editar clientes y ver su historial.
const {
    crearCliente,
    obtenerPorId,
    obtenerPorDocumento,
    listarClientes,
    actualizarCliente,
    obtenerHistorial,
} = require('../repositories/clientes.repository');

const TIPOS_DOCUMENTO = ['CC', 'CE', 'NIT', 'TI', 'PAS'];
const REGEX_ENTERO_POSITIVO = /^[1-9]\d*$/;
const REGEX_DOCUMENTO = /^[0-9A-Z-]{3,30}$/;
const REGEX_TELEFONO = /^[0-9+()\s-]{7,30}$/;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_DUPLICADO = 'El documento de identidad ya se encuentra registrado.';

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

// "1.090.123 456" -> "1090123456"; las letras en mayúscula (pasaportes, NIT con letra)
function normalizarDocumento(valor) {
    return String(valor).replace(/[.\s]/g, '').toUpperCase();
}

// Valida y normaliza los campos de contacto. Devuelve { campos } o { error }.
// `parcial` = true para el PUT: solo se validan los campos que vienen.
function validarDatos(body, parcial) {
    const campos = {};

    if (body.nombre !== undefined || !parcial) {
        if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
            return { error: 'El nombre del cliente es obligatorio.' };
        }
        const nombre = body.nombre.trim().replace(/\s+/g, ' ');
        if (nombre.length > 150) return { error: 'El nombre admite máximo 150 caracteres.' };
        campos.nombre = nombre;
    }

    // Opcionales: "" o null los dejan vacíos
    const opcional = (clave, maximo, regex, mensaje, transformar = (v) => v) => {
        if (body[clave] === undefined) return null;
        if (body[clave] === null || (typeof body[clave] === 'string' && !body[clave].trim())) {
            campos[clave] = null;
            return null;
        }
        if (typeof body[clave] !== 'string') return mensaje;
        const valor = transformar(body[clave].trim());
        if (valor.length > maximo || (regex && !regex.test(valor))) return mensaje;
        campos[clave] = valor;
        return null;
    };

    const error =
        opcional('telefono', 30, REGEX_TELEFONO, 'El teléfono debe tener entre 7 y 30 caracteres (números, espacios, +, - o paréntesis).') ||
        opcional('correo', 150, REGEX_CORREO, 'El correo no tiene un formato válido.', (v) => v.toLowerCase()) ||
        opcional('direccion', 200, null, 'La dirección admite máximo 200 caracteres.');
    if (error) return { error };

    if (body.estado !== undefined) {
        if (typeof body.estado !== 'boolean') return { error: "El campo 'estado' debe ser true o false." };
        campos.estado = body.estado;
    }

    return { campos };
}

// =====================================================================
// POST /api/customers
// =====================================================================
async function postCliente(req, res) {
    try {
        const body = req.body || {};

        if (body.identificacion === undefined || body.identificacion === null || !String(body.identificacion).trim()) {
            return badRequest(res, 'El documento de identidad es obligatorio.');
        }
        const identificacion = normalizarDocumento(body.identificacion);
        if (!REGEX_DOCUMENTO.test(identificacion)) {
            return badRequest(res, 'El documento de identidad debe tener entre 3 y 30 caracteres (números, letras o guion).');
        }

        const tipoIdentificacion = body.tipo_identificacion === undefined
            ? 'CC'
            : String(body.tipo_identificacion).trim().toUpperCase();
        if (!TIPOS_DOCUMENTO.includes(tipoIdentificacion)) {
            return badRequest(res, `El tipo de documento debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}.`);
        }

        const { campos, error } = validarDatos(body, false);
        if (error) return badRequest(res, error);
        if (campos.estado !== undefined) {
            return badRequest(res, 'Un cliente nuevo siempre se registra activo.');
        }

        // CU-09 EX-1: si ya existe, se informa y se devuelve para cargarlo en pantalla
        const existente = await obtenerPorDocumento(identificacion);
        if (existente) {
            return res.status(409).json({ error: 'Conflict', message: MSG_DUPLICADO, cliente: existente });
        }

        const cliente = await crearCliente({
            tipoIdentificacion,
            identificacion,
            nombre: campos.nombre,
            telefono: campos.telefono ?? null,
            correo: campos.correo ?? null,
            direccion: campos.direccion ?? null,
        });
        return res.status(201).json({ message: 'Cliente guardado con éxito', cliente });
    } catch (error) {
        // Dos registros simultáneos del mismo documento: la BD rechaza el segundo
        if (error.code === '23505') {
            const existente = await obtenerPorDocumento(normalizarDocumento(req.body.identificacion)).catch(() => null);
            return res.status(409).json({ error: 'Conflict', message: MSG_DUPLICADO, cliente: existente });
        }
        console.error('[POST /api/customers] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar el cliente.' });
    }
}

// =====================================================================
// GET /api/customers?q=&estado=&page=&limit=
// =====================================================================
async function getClientes(req, res) {
    try {
        const { page, limit, q, estado } = req.query;
        const filtros = {};

        if (page !== undefined && !REGEX_ENTERO_POSITIVO.test(page)) {
            return badRequest(res, "El parámetro 'page' debe ser un entero mayor que 0.");
        }
        if (limit !== undefined && (!REGEX_ENTERO_POSITIVO.test(limit) || Number(limit) > 100)) {
            return badRequest(res, "El parámetro 'limit' debe ser un entero entre 1 y 100.");
        }
        if (estado !== undefined) {
            if (estado !== 'true' && estado !== 'false') {
                return badRequest(res, "El parámetro 'estado' debe ser 'true' o 'false'.");
            }
            filtros.estado = estado === 'true';
        }
        if (q !== undefined) {
            if (typeof q !== 'string' || q.length > 100) {
                return badRequest(res, "El parámetro 'q' debe ser un texto de máximo 100 caracteres.");
            }
            const texto = q.trim().replace(/\s+/g, ' ');
            if (texto) {
                filtros.busquedaNombre = texto;
                const documento = normalizarDocumento(texto);
                if (/^[0-9A-Z-]+$/.test(documento)) filtros.busquedaDocumento = documento;
            }
        }

        const pagina = page ? Number(page) : 1;
        const limite = limit ? Number(limit) : 10;
        const { data, total } = await listarClientes({ page: pagina, limit: limite, ...filtros });

        return res.status(200).json({
            data,
            pagination: { page: pagina, limit: limite, total, totalPages: Math.max(Math.ceil(total / limite), 1) },
        });
    } catch (error) {
        console.error('[GET /api/customers] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al listar clientes.' });
    }
}

// =====================================================================
// GET /api/customers/document/:documento   (CU-09 FA-1)
// =====================================================================
async function getClientePorDocumento(req, res) {
    try {
        const documento = normalizarDocumento(req.params.documento);
        if (!REGEX_DOCUMENTO.test(documento)) {
            return badRequest(res, 'El documento de identidad no tiene un formato válido.');
        }
        const cliente = await obtenerPorDocumento(documento);
        if (!cliente) {
            return res.status(404).json({ error: 'Not Found', message: `No existe un cliente con el documento ${documento}.` });
        }
        return res.status(200).json(cliente);
    } catch (error) {
        console.error('[GET /api/customers/document] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al buscar el cliente.' });
    }
}

// =====================================================================
// GET /api/customers/:id
// =====================================================================
async function getClientePorId(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del cliente debe ser un entero positivo.');
        }
        const cliente = await obtenerPorId(Number(req.params.id));
        if (!cliente) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el cliente con id ${req.params.id}.` });
        }
        return res.status(200).json(cliente);
    } catch (error) {
        console.error('[GET /api/customers/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar el cliente.' });
    }
}

// =====================================================================
// PUT /api/customers/:id   (CU-09 FA-1; el documento es inalterable, RB-1)
// Campos editables: nombre, telefono, correo, direccion, estado
// =====================================================================
async function putCliente(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del cliente debe ser un entero positivo.');
        }
        const idCliente = Number(req.params.id);
        const body = req.body || {};

        const actual = await obtenerPorId(idCliente);
        if (!actual) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el cliente con id ${req.params.id}.` });
        }

        // Se tolera reenviar el mismo documento (formularios que mandan todo), pero no cambiarlo
        const cambiaDocumento =
            (body.identificacion !== undefined && normalizarDocumento(body.identificacion) !== actual.identificacion) ||
            (body.tipo_identificacion !== undefined && String(body.tipo_identificacion).trim().toUpperCase() !== actual.tipo_identificacion);
        if (cambiaDocumento) {
            return badRequest(res, 'El documento de identidad del cliente no se puede modificar.');
        }

        const { campos, error } = validarDatos(body, true);
        if (error) return badRequest(res, error);
        if (Object.keys(campos).length === 0) {
            return badRequest(res, 'Debe enviar al menos un campo para actualizar: nombre, telefono, correo, direccion o estado.');
        }

        const cliente = await actualizarCliente(idCliente, campos);
        return res.status(200).json({ message: 'Cliente actualizado con éxito', cliente });
    } catch (error) {
        if (error.code === 'SM008') return badRequest(res, `${error.message}.`);
        console.error('[PUT /api/customers/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al actualizar el cliente.' });
    }
}

// =====================================================================
// GET /api/customers/:id/history?limit=   (HU-009 criterio 2)
// =====================================================================
async function getHistorialCliente(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) {
            return badRequest(res, 'El id del cliente debe ser un entero positivo.');
        }
        const { limit } = req.query;
        if (limit !== undefined && (!REGEX_ENTERO_POSITIVO.test(limit) || Number(limit) > 100)) {
            return badRequest(res, "El parámetro 'limit' debe ser un entero entre 1 y 100.");
        }

        const cliente = await obtenerPorId(Number(req.params.id));
        if (!cliente) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el cliente con id ${req.params.id}.` });
        }

        const historial = await obtenerHistorial(cliente.id_cliente, limit ? Number(limit) : 20);
        return res.status(200).json({ cliente, ...historial });
    } catch (error) {
        console.error('[GET /api/customers/:id/history] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar el historial.' });
    }
}

module.exports = {
    postCliente,
    getClientes,
    getClientePorDocumento,
    getClientePorId,
    putCliente,
    getHistorialCliente,
};
