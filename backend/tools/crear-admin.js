// tools/crear-admin.js
// Crea un usuario Administrador. Pensado para el despliegue, donde no se
// cargan los usuarios de prueba del seed.
//
//   docker compose exec api node tools/crear-admin.js "Nombre Completo" correo@dominio.com usuario
//
// Si no se define ADMIN_PASSWORD, genera una contraseña aleatoria y la
// muestra UNA sola vez en la consola.
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { buscarPorCorreoOUsuario, crearUsuario } = require('../src/repositories/usuarios.repository');

async function main() {
    const [nombreCompleto, correoEntrada, usuario] = process.argv.slice(2);
    if (!nombreCompleto || !correoEntrada || !usuario) {
        console.error('Uso: node tools/crear-admin.js "Nombre Completo" correo@dominio.com usuario');
        process.exitCode = 1;
        return;
    }

    const correo = correoEntrada.trim().toLowerCase();
    const generada = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    if (password.length < 8) {
        console.error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
        process.exitCode = 1;
        return;
    }

    if (await buscarPorCorreoOUsuario(correo, usuario)) {
        console.error(`Ya existe un usuario con el correo ${correo} o el usuario ${usuario}.`);
        process.exitCode = 1;
        return;
    }

    const { rows } = await pool.query(`SELECT id_rol FROM roles WHERE codigo = 'ADMIN'`);
    const admin = await crearUsuario({
        idRol: rows[0].id_rol,
        nombreCompleto,
        correo,
        usuario,
        passwordHash: await bcrypt.hash(password, 10),
    });

    console.log(`Administrador creado: id ${admin.id_usuario}, ${admin.correo}`);
    if (generada) {
        console.log(`Contraseña generada (guárdela ahora, no se volverá a mostrar): ${password}`);
    }
}

main()
    .catch((error) => {
        console.error('No se pudo crear el administrador:', error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
