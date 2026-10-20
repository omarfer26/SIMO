// src/repositories/usuarios.repository.js
// Acceso a datos de usuarios y roles (tablas de db/migrations/002_seguridad.sql).
// Ninguna consulta devuelve password_hash.
const pool = require('../config/db');

const COLUMNAS_PUBLICAS = `
    u.id_usuario, u.nombre_completo, u.correo, u.usuario, u.estado,
    u.id_rol, r.codigo AS rol_codigo, r.nombre AS rol_nombre,
    u.bloqueado_hasta, u.ultimo_acceso, u.creado_en, u.actualizado_en
`;

async function buscarPorCorreoOUsuario(correo, usuario) {
    const { rows } = await pool.query(
        `SELECT id_usuario FROM usuarios WHERE correo = $1 OR usuario = $2 LIMIT 1`,
        [correo, usuario]
    );
    return rows[0] || null;
}

async function existeRol(idRol) {
    const { rows } = await pool.query(`SELECT 1 FROM roles WHERE id_rol = $1`, [idRol]);
    return rows.length > 0;
}

async function crearUsuario({ idRol, nombreCompleto, correo, usuario, passwordHash }) {
    const { rows } = await pool.query(
        `WITH nuevo AS (
             INSERT INTO usuarios (id_rol, nombre_completo, correo, usuario, password_hash)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *
         )
         SELECT ${COLUMNAS_PUBLICAS} FROM nuevo u JOIN roles r ON r.id_rol = u.id_rol`,
        [idRol, nombreCompleto, correo, usuario, passwordHash]
    );
    return rows[0];
}

// SCRUM-23: listado paginado con filtros opcionales por estado, rol y texto.
async function listarUsuarios({ page, limit, estado, idRol, rolCodigo, busqueda }) {
    const condiciones = [];
    const valores = [];

    if (estado !== undefined) {
        valores.push(estado);
        condiciones.push(`u.estado = $${valores.length}`);
    }
    if (idRol !== undefined) {
        valores.push(idRol);
        condiciones.push(`u.id_rol = $${valores.length}`);
    }
    if (rolCodigo !== undefined) {
        valores.push(rolCodigo);
        condiciones.push(`r.codigo = $${valores.length}`);
    }
    if (busqueda !== undefined) {
        // Se escapan los comodines de LIKE para buscar el texto literal.
        valores.push(`%${busqueda.replace(/[\\%_]/g, '\\$&')}%`);
        const n = valores.length;
        condiciones.push(`(u.nombre_completo ILIKE $${n} OR u.correo ILIKE $${n} OR u.usuario ILIKE $${n})`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [datos, conteo] = await Promise.all([
        pool.query(
            `SELECT ${COLUMNAS_PUBLICAS}
             FROM usuarios u
             JOIN roles r ON r.id_rol = u.id_rol
             ${where}
             ORDER BY u.id_usuario
             LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
            [...valores, limit, offset]
        ),
        pool.query(
            `SELECT count(*)::int AS total
             FROM usuarios u
             JOIN roles r ON r.id_rol = u.id_rol
             ${where}`,
            valores
        ),
    ]);

    return { data: datos.rows, total: conteo.rows[0].total };
}

// SCRUM-23: detalle de un usuario (lo usa el modal de edición, SCRUM-21).
async function obtenerUsuarioPorId(idUsuario) {
    const { rows } = await pool.query(
        `SELECT ${COLUMNAS_PUBLICAS}
         FROM usuarios u
         JOIN roles r ON r.id_rol = u.id_rol
         WHERE u.id_usuario = $1`,
        [idUsuario]
    );
    return rows[0] || null;
}

module.exports = {
    buscarPorCorreoOUsuario,
    existeRol,
    crearUsuario,
    listarUsuarios,
    obtenerUsuarioPorId,
};
