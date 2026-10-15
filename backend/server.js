// Arranque como servidor normal (en local con `npm start`, o en hostings tipo Render/Railway).
// En Vercel no se usa este archivo: allí la app se ejecuta desde api/index.js.
const app = require('./app');
const connection = require('./db');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    connection.query('SELECT 1', (err) => {
        if (err) {
            console.error('Error al conectar a la base de datos:', err.message);
            return;
        }
        console.log('Conectado a la base de datos');
    });
});
