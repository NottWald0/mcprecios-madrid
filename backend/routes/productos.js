const express = require('express');
const router = express.Router();
const connection = require('../db');

// Creo un ENDPOINT para obtener todos los productos con sus precios y el restaurante
router.get('/productos', (req, res) => {

    // Esta consulta me permite obtener el nombre del producto, el nombre del restaurante, el precio actual y la fecha
    const query = `
        SELECT 
            p.id_producto,
            p.nombre AS nombre_producto,
            r.nombre AS nombre_restaurante,
            pr.precio AS precio_actual,
            pr.fecha AS fecha_actual
        FROM productos p
        JOIN restaurante r ON p.id_restaurante = r.id_restaurante
        JOIN precio pr ON p.id_producto = pr.id_producto
        ORDER BY p.nombre, r.nombre
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error al consultar los productos:', err);
            res.status(500).json({ error: 'Error al obtener los datos' });
            return;
        }
        res.json(results); // Envio los datos en formato JSON
    });
});

// Creo un ENDPOINT para obtener el historial de precios de un producto
router.get('/historico/:id_producto', (req, res) => {
    const id_producto = req.params.id_producto;
    // Con esta consulta obtengo el historial de un producto
    const query = `
        SELECT 
            h.precio AS precio_historico,
            h.fecha AS fecha_historico,
            p.nombre AS nombre_producto,
            r.nombre AS nombre_restaurante
        FROM historico h
        JOIN productos p ON h.id_producto = p.id_producto
        JOIN restaurante r ON p.id_restaurante = r.id_restaurante
        WHERE h.id_producto = ?
        ORDER BY h.fecha DESC
    `;
    // Ejecuto la consulta
    connection.query(query, [id_producto], (err, results) => {
        if (err) {
            console.error('Error al consultar el historial:', err);
            res.status(500).json({ error: 'Error al obtener el historial' });
            return;
        }
        res.json(results);
    });
});

module.exports = router;
