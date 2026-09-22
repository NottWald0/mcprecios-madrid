const express = require('express');
const router = express.Router();
const connection = require('../db');

// Creo un ENDPOINT para obtener todos los productos con sus precios y el restaurante
router.get('/productos', (req, res) => {

    // Esta consulta me permite obtener el nombre del producto, el nombre del restaurante, el precio actual y la fecha.
    // Además marco como "no fiable" el precio de los productos cuyo nombre aparece varias veces en Uber Eats
    // con precios distintos (p. ej. el producto suelto y dentro de una oferta): el scraper los guardaba como
    // uno solo, así que en una misma pasada (menos de 60 s) su precio "cambiaba" varias veces.
    const query = `
        WITH cambios AS (
            SELECT
                id_producto,
                precio,
                fecha,
                LAG(precio) OVER w AS precio_anterior,
                LAG(fecha) OVER w AS fecha_anterior
            FROM historico
            WINDOW w AS (PARTITION BY id_producto ORDER BY fecha, id_historico)
        ),
        ambiguos AS (
            SELECT DISTINCT id_producto
            FROM cambios
            WHERE precio <> precio_anterior
              AND TIMESTAMPDIFF(SECOND, fecha_anterior, fecha) BETWEEN 0 AND 60
        )
        SELECT
            p.id_producto,
            p.nombre AS nombre_producto,
            r.nombre AS nombre_restaurante,
            pr.precio AS precio_actual,
            pr.fecha AS fecha_actual,
            a.id_producto IS NULL AS precio_fiable
        FROM productos p
        JOIN restaurante r ON p.id_restaurante = r.id_restaurante
        JOIN precio pr ON p.id_producto = pr.id_producto
        LEFT JOIN ambiguos a ON a.id_producto = p.id_producto
        ORDER BY p.nombre, r.nombre
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error al consultar los productos:', err);
            res.status(500).json({ error: 'Error al obtener los datos' });
            return;
        }
        res.json(results.map(p => ({ ...p, precio_fiable: Boolean(p.precio_fiable) }))); // Envio los datos en formato JSON
    });
});

// Creo un ENDPOINT para obtener el historial de precios de un producto
router.get('/historico/:id_producto', (req, res) => {
    // Compruebo que el id sea un número entero positivo antes de consultar la BBDD
    const id_producto = Number(req.params.id_producto);
    if (!Number.isInteger(id_producto) || id_producto <= 0) {
        res.status(400).json({ error: 'El id del producto debe ser un número entero positivo' });
        return;
    }

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
