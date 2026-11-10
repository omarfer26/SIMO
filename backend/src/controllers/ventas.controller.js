// src/controllers/ventas.controller.js
// Ventas POS (HU-07, CU-10) y anulación con autorización (CU-11).
// Contratos del frontend: simoapp/lib/ventas/ventasService.ts y anulacionService.ts
const bcrypt = require('bcrypt');
const {
    registrarVenta,
    anularVenta,
    obtenerVenta,
    listarVentas,
    resumenDiario,
    buscarUsuarioPorCorreo,
    buscarUsuarioActivo,
} = require('../repositories/ventas.repository');
const { buscarMetodoPago } = require('../repositories/pedidos.repository');
const { aInstante } = require('../utils/fechas');
const { aNumero, excedeDecimales, REGEX_ENTERO_POSITIVO } = require('../utils/numeros');

// Errores de fn_registrar_venta y fn_anular_venta (SQLSTATE clase SM) -> HTTP
const ERRORES_VENTA = {
    SM001: [404, 'Not Found'],
    SM002: [409, 'Conflict'],
    SM003: [400, 'Bad Request'],
    SM004: [400, 'Bad Request'],
    SM005: [400, 'Bad Request'],
    SM015: [400, 'Bad Request'],
    SM019: [409, 'Conflict'],     // stock insuficiente (RN-01): el POS lo espera como 409
    SM022: [400, 'Bad Request'],
    SM023: [400, 'Bad Request'],
    SM025: [400, 'Bad Request'],
    SM026: [400, 'Bad Request'],
    SM028: [404, 'Not Found'],
    SM029: [409, 'Conflict'],
    SM030: [403, 'Forbidden'],
};

const ROLES_AUTORIZAN = ['GERENTE', 'ADMIN'];
const ROLES_VENDEN = ['VENDEDOR', 'GERENTE', 'ADMIN'];

function badRequest(res, message) {
    return res.status(400).json({ error: 'Bad Request', message });
}

function responderErrorNegocio(res, error) {
    const negocio = ERRORES_VENTA[error.code];
    if (!negocio) return false;
    const [status, nombre] = negocio;
    res.status(status).json({ error: nombre, message: `${error.message}.` });
    return true;
}

// =====================================================================
// POST /api/sales
// Body: { metodo_pago | id_metodo_pago, id_cliente?, id_vendedor?, descuento?,
//         referencia_pago?, detalles: [{ id_producto, cantidad }] }
// subtotal, total, impuestos y precio_unitario que mande el navegador se
// ignoran: los calcula la base con sus precios (RNF-04).
// =====================================================================
async function postVenta(req, res) {
    try {
        const idSesion = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idSesion ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        const { metodo_pago, id_metodo_pago, id_cliente, id_vendedor, descuento, referencia_pago } = req.body || {};
        const items = req.body?.detalles ?? req.body?.productos;

        if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
            return badRequest(res, 'La venta debe incluir entre 1 y 200 productos.');
        }
        const lineas = [];
        for (const [i, item] of items.entries()) {
            const n = i + 1;
            if (!item || typeof item !== 'object') return badRequest(res, `La línea ${n} no es válida.`);
            if (!REGEX_ENTERO_POSITIVO.test(String(item.id_producto ?? ''))) {
                return badRequest(res, `Línea ${n}: id_producto debe ser un entero positivo.`);
            }
            const cantidad = aNumero(item.cantidad);
            if (Number.isNaN(cantidad) || cantidad <= 0) return badRequest(res, `Línea ${n}: la cantidad debe ser mayor a cero.`);
            if (excedeDecimales(cantidad, 3) || cantidad > 999999999) return badRequest(res, `Línea ${n}: la cantidad admite máximo 3 decimales.`);
            lineas.push({ id_producto: Number(item.id_producto), cantidad });
        }

        // El POS manda el código ("EFECTIVO"); se acepta también el id. Sin dato: efectivo.
        let metodo;
        if (id_metodo_pago !== undefined && id_metodo_pago !== null) {
            if (!REGEX_ENTERO_POSITIVO.test(String(id_metodo_pago))) return badRequest(res, 'El id_metodo_pago debe ser un entero positivo.');
            metodo = await buscarMetodoPago({ id: Number(id_metodo_pago) });
        } else {
            const codigo = metodo_pago === undefined || metodo_pago === null ? 'EFECTIVO' : metodo_pago;
            if (typeof codigo !== 'string' || !codigo.trim()) return badRequest(res, 'El metodo_pago no es válido.');
            metodo = await buscarMetodoPago({ codigo: codigo.trim().toUpperCase() });
        }
        if (!metodo) return badRequest(res, 'El método de pago no existe o está inactivo.');

        if (id_cliente !== undefined && id_cliente !== null && !REGEX_ENTERO_POSITIVO.test(String(id_cliente))) {
            return badRequest(res, 'El id_cliente debe ser un entero positivo o null (consumidor final).');
        }
        let descuentoNumero = 0;
        if (descuento !== undefined && descuento !== null && descuento !== '') {
            descuentoNumero = aNumero(descuento);
            if (Number.isNaN(descuentoNumero) || descuentoNumero < 0 || excedeDecimales(descuentoNumero, 2)) {
                return badRequest(res, 'El descuento debe ser un número no negativo con máximo 2 decimales.');
            }
        }
        if (referencia_pago !== undefined && referencia_pago !== null
            && (typeof referencia_pago !== 'string' || referencia_pago.trim().length > 40)) {
            return badRequest(res, 'La referencia_pago debe ser un texto de máximo 40 caracteres.');
        }

        // Vendedor en turno (caja compartida): la venta queda a su nombre
        let idUsuario = Number(idSesion);
        if (id_vendedor !== undefined && id_vendedor !== null && Number(id_vendedor) !== idUsuario) {
            if (!REGEX_ENTERO_POSITIVO.test(String(id_vendedor))) return badRequest(res, 'El id_vendedor debe ser un entero positivo.');
            const vendedor = await buscarUsuarioActivo(Number(id_vendedor));
            if (!vendedor || !ROLES_VENDEN.includes(vendedor.rol)) {
                return badRequest(res, 'El vendedor en turno no existe, está inactivo o no puede vender.');
            }
            idUsuario = vendedor.id_usuario;
        }

        const idVenta = await registrarVenta({
            idUsuario,
            idMetodoPago: metodo.id_metodo_pago,
            lineas,
            idCliente: id_cliente ? Number(id_cliente) : null,
            descuento: descuentoNumero,
            referenciaPago: typeof referencia_pago === 'string' ? referencia_pago.trim() : null,
        });
        const venta = await obtenerVenta(idVenta);
        return res.status(201).json({ status: 'success', message: 'Venta procesada exitosamente', venta });
    } catch (error) {
        if (responderErrorNegocio(res, error)) return undefined;
        console.error('[POST /api/sales] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al registrar la venta.' });
    }
}

// =====================================================================
// GET /api/sales?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&estado=&limite=
// Historial para /ventas y el Dashboard. Sin "desde" trae los últimos 180
// días (lo que usa el Dashboard para comparar períodos).
// =====================================================================
const DIAS_HISTORIAL = 180;
const LIMITE_MAXIMO = 5000;

async function getVentas(req, res) {
    try {
        let desde = aInstante(req.query.desde, false);
        const hasta = aInstante(req.query.hasta, true);
        if (desde === undefined || hasta === undefined) {
            return badRequest(res, 'Los filtros desde y hasta deben tener formato AAAA-MM-DD o fecha y hora ISO 8601.');
        }
        if (desde && hasta && desde > hasta) return badRequest(res, 'La fecha desde no puede ser posterior a hasta.');
        if (!desde) desde = new Date(Date.now() - DIAS_HISTORIAL * 86400e3);

        let estado;
        if (req.query.estado !== undefined) {
            estado = String(req.query.estado).trim().toUpperCase();
            if (!['COMPLETADA', 'ANULADA'].includes(estado)) return badRequest(res, 'El estado debe ser COMPLETADA o ANULADA.');
        }
        let limite = LIMITE_MAXIMO;
        if (req.query.limite !== undefined) {
            if (!REGEX_ENTERO_POSITIVO.test(String(req.query.limite))) return badRequest(res, 'El limite debe ser un entero positivo.');
            limite = Math.min(Number(req.query.limite), LIMITE_MAXIMO);
        }
        const data = await listarVentas({ desde, hasta, estado, limite });
        return res.status(200).json({ data });
    } catch (error) {
        console.error('[GET /api/sales] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar las ventas.' });
    }
}

// GET /api/sales/:id — venta con sus líneas
async function getVenta(req, res) {
    try {
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) return badRequest(res, 'El id de la venta debe ser un entero positivo.');
        const venta = await obtenerVenta(Number(req.params.id));
        if (!venta) return res.status(404).json({ error: 'Not Found', message: `La venta ${req.params.id} no existe.` });
        return res.status(200).json({ venta });
    } catch (error) {
        console.error('[GET /api/sales/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar la venta.' });
    }
}

// =====================================================================
// GET /api/sales/daily-summary?fecha=AAAA-MM-DD — arqueo de caja del día
// (hoy, en hora de Colombia, si no se indica fecha)
// =====================================================================
async function getResumenDiario(req, res) {
    try {
        const fecha = req.query.fecha === undefined
            ? new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)
            : String(req.query.fecha);
        const inicio = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? aInstante(fecha, false) : undefined;
        if (!inicio) return badRequest(res, 'La fecha debe tener formato AAAA-MM-DD.');
        const resumen = await resumenDiario(inicio, aInstante(fecha, true));
        return res.status(200).json({
            status: 'success',
            mensaje: 'Resumen diario generado exitosamente',
            fecha,
            resumen,
            gran_total: resumen.reduce((suma, fila) => suma + fila.total_ingresos, 0),
        });
    } catch (error) {
        console.error('[GET /api/sales/daily-summary] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al generar el resumen diario.' });
    }
}

// =====================================================================
// POST /api/sales/:id/cancel (alias /annul; PUT /cancel se conserva)
// Body: { motivo, auth_email, auth_password }
// La anulación la autoriza un Gerente o Administrador con sus credenciales
// (CU-11). Si quien llama ya es Gerente o Administrador y no envía
// credenciales, se autoriza a sí mismo.
// =====================================================================
async function postAnularVenta(req, res) {
    try {
        const idUsuario = req.user?.id_usuario;
        if (!REGEX_ENTERO_POSITIVO.test(String(idUsuario ?? ''))) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No se pudo identificar al usuario de la sesión.' });
        }
        if (!REGEX_ENTERO_POSITIVO.test(req.params.id)) return badRequest(res, 'El id de la venta debe ser un entero positivo.');

        const motivo = req.body?.motivo ?? req.body?.causa;
        if (typeof motivo !== 'string' || motivo.trim().length < 5) {
            return badRequest(res, 'Debe ingresar el motivo de la anulación (mínimo 5 caracteres).');
        }
        if (motivo.length > 500) return badRequest(res, 'El motivo admite máximo 500 caracteres.');

        const correo = req.body?.auth_email ?? req.body?.auth_correo;
        const clave = req.body?.auth_password;
        let idAutorizador;
        if (correo !== undefined || clave !== undefined) {
            if (typeof correo !== 'string' || typeof clave !== 'string' || !correo.trim() || !clave) {
                return badRequest(res, 'Indique el correo y la contraseña de quien autoriza.');
            }
            const autorizador = await buscarUsuarioPorCorreo(correo.trim().toLowerCase());
            const claveValida = autorizador ? await bcrypt.compare(clave, autorizador.password_hash) : false;
            if (!autorizador || !claveValida || !autorizador.estado) {
                return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales del autorizador incorrectas o usuario inactivo.' });
            }
            if (!ROLES_AUTORIZAN.includes(autorizador.rol)) {
                return res.status(403).json({ error: 'Forbidden', message: 'Solo un Gerente o Administrador puede autorizar anulaciones.' });
            }
            idAutorizador = autorizador.id_usuario;
        } else if (ROLES_AUTORIZAN.includes(req.user.rol)) {
            idAutorizador = Number(idUsuario);
        } else {
            return res.status(403).json({ error: 'Forbidden', message: 'La anulación requiere las credenciales de un Gerente o Administrador.' });
        }

        const resultado = await anularVenta({
            idVenta: Number(req.params.id),
            idUsuario: Number(idUsuario),
            idAutorizador,
            motivo: motivo.trim(),
        });
        const venta = await obtenerVenta(resultado.id_venta);
        return res.status(200).json({
            status: 'success',
            message: `La venta #${resultado.id_venta} fue anulada y el stock fue restaurado.`,
            fecha: resultado.anulada_en,
            venta,
        });
    } catch (error) {
        if (responderErrorNegocio(res, error)) return undefined;
        console.error('[POST /api/sales/:id/cancel] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al anular la venta.' });
    }
}

module.exports = { postVenta, getVentas, getVenta, getResumenDiario, postAnularVenta };
