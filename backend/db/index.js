// db/index.js
// Pool de conexiones que usan index.js y routes/. Se reutiliza el mismo pool de
// src/config/db.js para que toda la API comparta UNA sola configuración:
//   * DATABASE_URL (Neon): con SSL, salvo DB_SSL=false
//   * DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD: base local o en Docker
//
// Antes este archivo creaba un segundo pool que exigía SSL siempre (fallaba
// con una base local) y cargaba dotenv, que en producción no se instala
// (es devDependency), por lo que la API no arrancaba en Docker. Las variables
// del archivo .env se cargan con `npm run dev` (nodemon -r dotenv/config).
const pool = require('../src/config/db');

// Mensajes de verificación en consola
pool.on('connect', () => {
    console.log('✅ Conexión exitosa a PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de conexiones:', err);
});

module.exports = pool;
