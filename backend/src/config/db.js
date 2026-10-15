// src/config/db.js
// Pool de conexiones a PostgreSQL compartido por los módulos de src/.
//
// Dos formas de configurarlo:
//   * DATABASE_URL (Neon u otro servicio en la nube): cadena de conexión
//     completa; usa SSL salvo que se defina DB_SSL=false.
//   * DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD: base local o en Docker,
//     sin SSL salvo que se defina DB_SSL=true.
const { Pool } = require('pg');

function usarSsl(porDefecto) {
    if (process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
    if (process.env.DB_SSL === 'false') return false;
    return porDefecto ? { rejectUnauthorized: false } : false;
}

const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: usarSsl(true) })
    : new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: usarSsl(false),
    });

module.exports = pool;
