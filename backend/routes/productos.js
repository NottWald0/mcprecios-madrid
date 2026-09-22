const express = require('express');
const router = express.Router();
const connection = require('../db');

// Creo un ENDPOINT para obtener todos los productos con sus precios y el restaurante
router.get('/productos', (req, res) => {

    // Esta consulta me permite obtener el nombre del producto, el nombre del restaurante, el precio actual y la fecha.
    // - Solo devuelvo los productos "vigentes": los que aparecieron en la última lectura de su restaurante.
    //   Si un producto ya no está en la carta, su último precio sería antiguo y no se debe comparar.
    // - Marco como "no fiable" el precio de los productos cuyo nombre aparecía varias veces en Uber Eats con
    //   precios distintos (el scraper antiguo los guardaba como uno solo, así que en una misma pasada había
    //   lecturas con precios distintos a menos de 60 s). Solo cuenta si pasó en los 30 días anteriores al
    //   precio actual: si el producto se ha vuelto a leer con el scraper nuevo, su precio ya es fiable.
    const query = `
        WITH lecturas AS (
            SELECT
                id_producto,
                fecha,
                MIN(precio) OVER w AS precio_min_cercano,
                MAX(precio) OVER w AS precio_max_cercano
            FROM historico
            WINDOW w AS (PARTITION BY id_producto ORDER BY fecha RANGE BETWEEN INTERVAL 60 SECOND PRECEDING AND INTERVAL 60 SECOND FOLLOWING)
        ),
        ambiguos AS (
            SELECT DISTINCT l.id_producto
            FROM lecturas l
            JOIN precio pr ON pr.id_producto = l.id_producto
            WHERE l.precio_min_cercano <> l.precio_max_cercano
              AND l.fecha >= pr.fecha - INTERVAL 30 DAY
        ),
        actuales AS (
            SELECT
                p.id_producto,
                p.nombre AS nombre_producto,
                p.categoria,
                r.nombre AS nombre_restaurante,
                pr.precio AS precio_actual,
                pr.fecha AS fecha_actual,
                MAX(pr.fecha) OVER (PARTITION BY p.id_restaurante) AS ultima_lectura
            FROM productos p
            JOIN restaurante r ON p.id_restaurante = r.id_restaurante
            JOIN precio pr ON p.id_producto = pr.id_producto
        )
        SELECT
            act.id_producto,
            act.nombre_producto,
            act.categoria,
            act.nombre_restaurante,
            act.precio_actual,
            act.fecha_actual,
            a.id_producto IS NULL AS precio_fiable
        FROM actuales act
        LEFT JOIN ambiguos a ON a.id_producto = act.id_producto
        WHERE act.fecha_actual >= act.ultima_lectura - INTERVAL 1 DAY
        ORDER BY act.nombre_producto, act.nombre_restaurante
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

    // Con esta consulta obtengo el historial de un producto.
    // Marco como "ambigua" cada lectura que tiene, a menos de 60 s, otra lectura con un precio distinto:
    // son los saltos del scraper antiguo al mezclar artículos con el mismo nombre, no cambios reales.
    const query = `
        SELECT
            t.precio_historico,
            t.fecha_historico,
            t.nombre_producto,
            t.nombre_restaurante,
            t.precio_min_cercano <> t.precio_max_cercano AS lectura_ambigua
        FROM (
            SELECT
                h.precio AS precio_historico,
                h.fecha AS fecha_historico,
                p.nombre AS nombre_producto,
                r.nombre AS nombre_restaurante,
                MIN(h.precio) OVER w AS precio_min_cercano,
                MAX(h.precio) OVER w AS precio_max_cercano
            FROM historico h
            JOIN productos p ON h.id_producto = p.id_producto
            JOIN restaurante r ON p.id_restaurante = r.id_restaurante
            WHERE h.id_producto = ?
            WINDOW w AS (ORDER BY h.fecha RANGE BETWEEN INTERVAL 60 SECOND PRECEDING AND INTERVAL 60 SECOND FOLLOWING)
        ) t
        ORDER BY t.fecha_historico DESC
    `;
    // Ejecuto la consulta
    connection.query(query, [id_producto], (err, results) => {
        if (err) {
            console.error('Error al consultar el historial:', err);
            res.status(500).json({ error: 'Error al obtener el historial' });
            return;
        }
        res.json(results.map(h => ({ ...h, lectura_ambigua: Boolean(h.lectura_ambigua) })));
    });
});

module.exports = router;
