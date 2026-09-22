require('dotenv').config();
const mysql = require('mysql2');

// Conexión a la BBDD usando variables de entorno.
// Si no están definidas, uso los valores de desarrollo local por defecto.
// Uso un pool en vez de una única conexión: en el hosting, MySQL cierra las
// conexiones inactivas y el pool abre otra nueva automáticamente.
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'comparador_de_precios',
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true
});

pool.query('SELECT 1', (err) => {
    if (err) {
        console.error('Error al conectar a MySQL:', err);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
});

module.exports = pool;
