// src/controllers/usuarios.controller.js
// RF-02: administrar usuarios (crear, consultar). Uso exclusivo del Administrador
// (la protección con JWT + RBAC se activa en las rutas cuando exista SCRUM-16/18).
const bcrypt = require('bcrypt');
const {
    buscarPorCorreoOUsuario,
    existeRol,
    crearUsuario,
    listarUsuarios,
    obtenerUsuarioPorId,
    buscarDuplicadoDeOtro,
    actualizarUsuario,
    cambiarEstadoUsuario,
} = require('../repositories/usuarios.repository');

const SALT_ROUNDS = 10;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_ENTERO_POSITIVO = /^[1-9]\d*$/;
const LIMITE_POR_DEFECTO = 10;
const LIMITE_MAXIMO = 100;

function badRequest(res, message, extra = {}) {
    return res.status(400).json({ error: 'Bad Request', message, ...extra });
}

// =====================================================================
// POST /api/users (SCRUM-22)
// =====================================================================
async function postUsuario(req, res) {
    try {
        const { id_rol, nombre_completo, correo, usuario, password } = req.body || {};

        const camposFaltantes = [];
        if (!id_rol) camposFaltantes.push('id_rol');
        if (typeof nombre_completo !== 'string' || !nombre_completo.trim()) camposFaltantes.push('nombre_completo');
        if (typeof correo !== 'string' || !correo.trim()) camposFaltantes.push('correo');
        if (typeof usuario !== 'string' || !usuario.trim()) camposFaltantes.push('usuario');
        if (typeof password !== 'string' || !password) camposFaltantes.push('password');

        if (camposFaltantes.length > 0) {
            return badRequest(res, 'Faltan campos obligatorios.', { campos: camposFaltantes });
        }

        const correoNormalizado = correo.trim().toLowerCase();
        if (!REGEX_CORREO.test(correoNormalizado)) {
            return badRequest(res, 'El correo no tiene un formato válido.');
        }
        if (password.length < 8) {
            return badRequest(res, 'La contraseña debe tener al menos 8 caracteres.');
        }
        if (!REGEX_ENTERO_POSITIVO.test(String(id_rol)) || !(await existeRol(Number(id_rol)))) {
            return badRequest(res, `El rol con id ${id_rol} no existe.`);
        }

        const existente = await buscarPorCorreoOUsuario(correoNormalizado, usuario.trim());
        if (existente) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'Ya existe un usuario con ese correo o nombre de usuario.',
            });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const nuevoUsuario = await crearUsuario({
            idRol: Number(id_rol),
            nombreCompleto: nombre_completo.trim(),
            correo: correoNormalizado,
            usuario: usuario.trim(),
            passwordHash,
        });

        return res.status(201).json({ message: 'Usuario creado exitosamente', usuario: nuevoUsuario });
    } catch (error) {
        // Dos altas simultáneas con el mismo correo: la BD rechaza la segunda.
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Conflict',
                message: 'Ya existe un usuario con ese correo o nombre de usuario.',
            });
        }
        console.error('[POST /api/users] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al crear el usuario.' });
    }
}

// =====================================================================
// GET /api/users (SCRUM-23)
// Query: page, limit (máx. 100), estado (true|false), id_rol, rol (código), q (texto)
// =====================================================================
async function getUsuarios(req, res) {
    try {
        const { page, limit, estado, id_rol, rol, q } = req.query;
        const filtros = {};

        if (page !== undefined && !REGEX_ENTERO_POSITIVO.test(page)) {
            return badRequest(res, "El parámetro 'page' debe ser un entero mayor que 0.");
        }
        if (limit !== undefined && (!REGEX_ENTERO_POSITIVO.test(limit) || Number(limit) > LIMITE_MAXIMO)) {
            return badRequest(res, `El parámetro 'limit' debe ser un entero entre 1 y ${LIMITE_MAXIMO}.`);
        }
        if (estado !== undefined) {
            if (estado !== 'true' && estado !== 'false') {
                return badRequest(res, "El parámetro 'estado' debe ser 'true' o 'false'.");
            }
            filtros.estado = estado === 'true';
        }
        if (id_rol !== undefined) {
            if (!REGEX_ENTERO_POSITIVO.test(id_rol)) {
                return badRequest(res, "El parámetro 'id_rol' debe ser un entero positivo.");
            }
            filtros.idRol = Number(id_rol);
        }
        if (rol !== undefined) {
            if (typeof rol !== 'string' || !/^[A-Za-z_]{1,20}$/.test(rol)) {
                return badRequest(res, "El parámetro 'rol' debe ser un código de rol (ADMIN, GERENTE, INVENTARIO, VENDEDOR).");
            }
            filtros.rolCodigo = rol.toUpperCase();
        }
        if (q !== undefined) {
            if (typeof q !== 'string' || q.length > 100) {
                return badRequest(res, "El parámetro 'q' debe ser un texto de máximo 100 caracteres.");
            }
            if (q.trim()) filtros.busqueda = q.trim();
        }

        const pagina = page ? Number(page) : 1;
        const limite = limit ? Number(limit) : LIMITE_POR_DEFECTO;
        const { data, total } = await listarUsuarios({ page: pagina, limit: limite, ...filtros });

        return res.status(200).json({
            data,
            pagination: {
                page: pagina,
                limit: limite,
                total,
                totalPages: Math.max(Math.ceil(total / limite), 1),
            },
        });
    } catch (error) {
        console.error('[GET /api/users] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al listar usuarios.' });
    }
}

// =====================================================================
// GET /api/users/:id (SCRUM-23)
// =====================================================================
async function getUsuarioPorId(req, res) {
    try {
        const { id } = req.params;
        if (!REGEX_ENTERO_POSITIVO.test(id)) {
            return badRequest(res, 'El id de usuario debe ser un entero positivo.');
        }

        const usuario = await obtenerUsuarioPorId(Number(id));
        if (!usuario) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el usuario con id ${id}.` });
        }
        return res.status(200).json(usuario);
    } catch (error) {
        console.error('[GET /api/users/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al consultar el usuario.' });
    }
}

// =====================================================================
// PUT /api/users/:id (SCRUM-24)
// Body (todos opcionales, al menos uno): id_rol, nombre_completo, correo, usuario.
// La contraseña y el estado no se editan aquí: el estado tiene su propio
// endpoint (SCRUM-25) y la contraseña es otro flujo.
// =====================================================================
async function putUsuario(req, res) {
    try {
        const { id } = req.params;
        if (!REGEX_ENTERO_POSITIVO.test(id)) {
            return badRequest(res, 'El id de usuario debe ser un entero positivo.');
        }
        const body = req.body || {};

        if (body.password !== undefined) {
            return badRequest(res, 'La contraseña no se modifica con este endpoint.');
        }
        if (body.estado !== undefined) {
            return badRequest(res, 'El estado se cambia con PATCH /api/users/:id/status.');
        }

        const campos = {};
        if (body.nombre_completo !== undefined) {
            if (typeof body.nombre_completo !== 'string' || !body.nombre_completo.trim()) {
                return badRequest(res, 'El nombre completo no puede estar vacío.');
            }
            if (body.nombre_completo.trim().length > 150) {
                return badRequest(res, 'El nombre completo admite máximo 150 caracteres.');
            }
            campos.nombre_completo = body.nombre_completo.trim();
        }
        if (body.correo !== undefined) {
            const correo = typeof body.correo === 'string' ? body.correo.trim().toLowerCase() : '';
            if (!REGEX_CORREO.test(correo) || correo.length > 150) {
                return badRequest(res, 'El correo no tiene un formato válido.');
            }
            campos.correo = correo;
        }
        if (body.usuario !== undefined) {
            if (typeof body.usuario !== 'string' || !body.usuario.trim()) {
                return badRequest(res, 'El nombre de usuario no puede estar vacío.');
            }
            if (body.usuario.trim().length > 50) {
                return badRequest(res, 'El nombre de usuario admite máximo 50 caracteres.');
            }
            campos.usuario = body.usuario.trim();
        }
        if (body.id_rol !== undefined) {
            if (!REGEX_ENTERO_POSITIVO.test(String(body.id_rol)) || !(await existeRol(Number(body.id_rol)))) {
                return badRequest(res, `El rol con id ${body.id_rol} no existe.`);
            }
            campos.id_rol = Number(body.id_rol);
        }
        if (Object.keys(campos).length === 0) {
            return badRequest(res, 'Debe enviar al menos un campo para actualizar: id_rol, nombre_completo, correo o usuario.');
        }

        if (campos.correo !== undefined || campos.usuario !== undefined) {
            const duplicado = await buscarDuplicadoDeOtro(Number(id), campos.correo, campos.usuario);
            if (duplicado) {
                return res.status(409).json({
                    error: 'Conflict',
                    message: 'Ya existe otro usuario con ese correo o nombre de usuario.',
                });
            }
        }

        const resultado = await actualizarUsuario(Number(id), campos);
        if (resultado.noExiste) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el usuario con id ${id}.` });
        }
        if (resultado.ultimoAdmin) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'No se puede quitar el rol de Administrador al último administrador activo.',
            });
        }
        return res.status(200).json({ message: 'Usuario actualizado exitosamente', usuario: resultado.usuario });
    } catch (error) {
        // Dos ediciones simultáneas hacia el mismo correo/usuario: la BD rechaza la segunda
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Conflict',
                message: 'Ya existe otro usuario con ese correo o nombre de usuario.',
            });
        }
        console.error('[PUT /api/users/:id] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al actualizar el usuario.' });
    }
}

// =====================================================================
// PATCH /api/users/:id/status   (SCRUM-25; alias /api/users/:id/estado,
// la ruta que propuso el frontend para SCRUM-21)
// Body: { estado: true | false }. Inactivar no borra al usuario: le impide
// iniciar sesión y corta de inmediato las sesiones abiertas.
// =====================================================================
async function patchEstadoUsuario(req, res) {
    try {
        const { id } = req.params;
        if (!REGEX_ENTERO_POSITIVO.test(id)) {
            return badRequest(res, 'El id de usuario debe ser un entero positivo.');
        }
        const { estado } = req.body || {};
        if (typeof estado !== 'boolean') {
            return badRequest(res, "El campo 'estado' es obligatorio y debe ser true o false.");
        }

        const resultado = await cambiarEstadoUsuario(Number(id), estado);
        if (resultado.noExiste) {
            return res.status(404).json({ error: 'Not Found', message: `No existe el usuario con id ${id}.` });
        }
        if (resultado.ultimoAdmin) {
            return res.status(409).json({
                error: 'Conflict',
                message: 'No se puede inactivar al último administrador activo.',
            });
        }
        return res.status(200).json({
            message: estado ? 'Usuario activado exitosamente' : 'Usuario inactivado exitosamente',
            usuario: resultado.usuario,
        });
    } catch (error) {
        console.error('[PATCH /api/users/:id/status] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: 'Error interno al cambiar el estado del usuario.' });
    }
}

module.exports = { postUsuario, getUsuarios, getUsuarioPorId, putUsuario, patchEstadoUsuario };
