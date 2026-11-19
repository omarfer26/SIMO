// src/config/db.js
// Pool de conexiones a PostgreSQL compartido por los módulos de src/.
//
// Dos formas de configurarlo:
//   * DATABASE_URL (Neon u otro servicio en la nube): cadena de conexión
//     completa; usa SSL salvo que se defina DB_SSL=false.
//   * DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD: base local o en Docker,
//     sin SSL salvo que se defina DB_SSL=true.
const dns = require('node:dns');
const net = require('node:net');
const { Pool } = require('pg');

// Neon publica direcciones IPv4 e IPv6. En contenedores sin IPv6 (Docker por
// defecto, varios servicios en la nube) Node intenta las dos y aborta cada
// intento a los 250 ms: con la latencia hacia us-east-2 el intento IPv4 se
// cortaba y algunas conexiones fallaban al azar con ENETUNREACH (SCRUM-173).
// Se prueba primero IPv4 y se le da tiempo suficiente.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

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
