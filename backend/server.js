require('dotenv').config();
const express = require('express');
const cors = require('cors');

const productosRouter = require('./routes/productos');

//Con esto manejo las rutas y peticiones
const app = express();
app.use(cors());
app.use(express.json());

// Monto todas las rutas de productos/historico bajo el prefijo /api
app.use('/api', productosRouter);

// Inicio el servidor. En local uso el 5000; en el hosting (Render/Railway)
// la plataforma asigna su propio puerto a través de process.env.PORT.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
