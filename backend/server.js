require('dotenv').config();
const express = require('express');
const cors = require('cors');

const connection = require('./db');
const productosRouter = require('./routes/productos');

//Con esto manejo las rutas y peticiones
const app = express();
app.use(cors());
app.use(express.json());

// Ruta para comprobar que el servidor y la base de datos están funcionando
app.get('/api/health', (req, res) => {
    connection.query('SELECT 1', (err) => {
        if (err) {
            res.status(503).json({ estado: 'error', baseDeDatos: 'sin conexión' });
            return;
        }
        res.json({ estado: 'ok', baseDeDatos: 'conectada' });
    });
});

// Monto todas las rutas de productos/historico bajo el prefijo /api
app.use('/api', productosRouter);

// Cualquier otra ruta no existe: devuelvo un 404 claro en JSON
app.use((req, res) => {
    res.status(404).json({ error: `La ruta ${req.method} ${req.path} no existe` });
});

// Inicio el servidor. En local uso el 5000; en el hosting (Render/Railway)
// la plataforma asigna su propio puerto a través de process.env.PORT.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
