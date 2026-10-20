const { Pool } = require('pg');
require('dotenv').config();

// Configuración del Pool usando la variable DATABASE_URL de tu .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Requerido para conexiones a Neon
    }
});

// Mensajes de verificación en consola
pool.on('connect', () => {
    console.log('✅ Conexión exitosa a Neon PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de conexiones:', err);
});

module.exports = pool;