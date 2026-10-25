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

// SCRUM-24: ¿el correo o el nombre de usuario ya los tiene OTRO usuario?
async function buscarDuplicadoDeOtro(idUsuario, correo, usuario) {
    const { rows } = await pool.query(
        `SELECT id_usuario FROM usuarios
         WHERE id_usuario <> $1 AND (correo = $2 OR usuario = $3)
         LIMIT 1`,
        [idUsuario, correo ?? null, usuario ?? null]
    );
    return rows[0] || null;
}

// SCRUM-24: actualiza los campos recibidos en una transacción.
// Si cambia el rol, impide dejar el sistema sin administradores activos.
// Devuelve { usuario } o { noExiste: true } o { ultimoAdmin: true }.
const COLUMNAS_EDITABLES = ['id_rol', 'nombre_completo', 'correo', 'usuario'];

async function actualizarUsuario(idUsuario, campos) {
    const columnas = Object.keys(campos).filter((c) => COLUMNAS_EDITABLES.includes(c));
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        if (campos.id_rol !== undefined) {
            // Pone en fila todos los cambios de rol/estado de usuarios: así dos
            // cambios simultáneos no pueden dejar el sistema sin administradores.
            await cliente.query(`SELECT pg_advisory_xact_lock(hashtext('simo.administradores'))`);
        }

        const { rows: actuales } = await cliente.query(
            `SELECT u.id_usuario, u.estado, r.codigo AS rol_codigo
             FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
             WHERE u.id_usuario = $1
             FOR UPDATE OF u`,
            [idUsuario]
        );
        if (!actuales.length) {
            await cliente.query('ROLLBACK');
            return { noExiste: true };
        }
        const actual = actuales[0];

        if (campos.id_rol !== undefined && actual.rol_codigo === 'ADMIN' && actual.estado) {
            const { rows: rol } = await cliente.query(`SELECT codigo FROM roles WHERE id_rol = $1`, [campos.id_rol]);
            if (rol[0].codigo !== 'ADMIN') {
                const { rows: admins } = await cliente.query(
                    `SELECT count(*)::int AS n FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
                     WHERE r.codigo = 'ADMIN' AND u.estado AND u.id_usuario <> $1`,
                    [idUsuario]
                );
                if (admins[0].n === 0) {
                    await cliente.query('ROLLBACK');
                    return { ultimoAdmin: true };
                }
            }
        }

        const asignaciones = columnas.map((col, i) => `${col} = $${i + 2}`);
        await cliente.query(
            `UPDATE usuarios SET ${asignaciones.join(', ')} WHERE id_usuario = $1`,
            [idUsuario, ...columnas.map((col) => campos[col])]
        );
        const { rows } = await cliente.query(
            `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
            [idUsuario]
        );
        await cliente.query('COMMIT');
        return { usuario: rows[0] };
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

// SCRUM-25: activa o inactiva un usuario. No permite inactivar al último
// administrador activo. Usa el mismo bloqueo que el cambio de rol (SCRUM-24)
// para que ambas operaciones no se crucen.
// Devuelve { usuario } o { noExiste: true } o { ultimoAdmin: true }.
async function cambiarEstadoUsuario(idUsuario, estado) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query(`SELECT pg_advisory_xact_lock(hashtext('simo.administradores'))`);

        const { rows: actuales } = await cliente.query(
            `SELECT u.id_usuario, u.estado, r.codigo AS rol_codigo
             FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
             WHERE u.id_usuario = $1
             FOR UPDATE OF u`,
            [idUsuario]
        );
        if (!actuales.length) {
            await cliente.query('ROLLBACK');
            return { noExiste: true };
        }
        const actual = actuales[0];

        if (!estado && actual.estado && actual.rol_codigo === 'ADMIN') {
            const { rows: admins } = await cliente.query(
                `SELECT count(*)::int AS n FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
                 WHERE r.codigo = 'ADMIN' AND u.estado AND u.id_usuario <> $1`,
                [idUsuario]
            );
            if (admins[0].n === 0) {
                await cliente.query('ROLLBACK');
                return { ultimoAdmin: true };
            }
        }

        // Al reactivar se limpia un posible bloqueo por intentos fallidos
        await cliente.query(
            `UPDATE usuarios
             SET estado = $2,
                 intentos_fallidos = CASE WHEN $2 THEN 0 ELSE intentos_fallidos END,
                 bloqueado_hasta  = CASE WHEN $2 THEN NULL ELSE bloqueado_hasta END
             WHERE id_usuario = $1`,
            [idUsuario, estado]
        );
        const { rows } = await cliente.query(
            `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
            [idUsuario]
        );
        await cliente.query('COMMIT');
        return { usuario: rows[0] };
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = {
    buscarPorCorreoOUsuario,
    existeRol,
    crearUsuario,
    listarUsuarios,
    obtenerUsuarioPorId,
    buscarDuplicadoDeOtro,
    actualizarUsuario,
    cambiarEstadoUsuario,
};
