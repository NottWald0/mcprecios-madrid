require('dotenv').config();
const mysql = require('mysql2');

// Conexión a la BBDD usando variables de entorno.
// Si no están definidas, uso los valores de desarrollo local por defecto.
// Uso un pool en vez de una única conexión: en el hosting, la base de datos cierra
// las conexiones inactivas y el pool abre otra nueva automáticamente.
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'comparador_de_precios',
    // DB_SSL=true para bases de datos en la nube que exigen conexión cifrada (p. ej. TiDB Cloud)
    ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true
});

module.exports = pool;
