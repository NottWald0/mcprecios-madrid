import React from 'react';
import { AVISO_NO_FIABLE, formatoEuros, nombreCorto } from '../utils/precios';

// Matriz producto x restaurante con el precio actual de cada uno
export default function TablaTodos({ filas, restaurantes, miRestaurante, onVerProducto, onVerHistorial }) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-matriz">
        <thead>
          <tr>
            <th className="col-producto">Producto</th>
            {restaurantes.map(r => (
              <th key={r} className={`num ${r === miRestaurante ? 'col-mio' : ''}`} title={r}>
                {nombreCorto(r)}{r === miRestaurante && <span className="etiqueta-tu">Tú</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const porRestaurante = new Map(f.filas.map(item => [item.nombre_restaurante, item]));
            return (
              <tr key={f.producto}>
                <td className="col-producto">
                  <button className="producto-enlace" onClick={() => onVerProducto(f)} title="Comparar en todos los restaurantes">
                    {f.producto}
                  </button>
                </td>
                {restaurantes.map(r => {
                  const item = porRestaurante.get(r);
                  const esMin = item && item.precio_fiable && item.precio_actual === f.min;
                  return (
                    <td key={r} className={`num ${r === miRestaurante ? 'col-mio' : ''}`}>
                      {item ? (
                        <button
                          className={`precio-enlace ${esMin ? 'precio-min' : ''} ${item.precio_fiable ? '' : 'precio-no-fiable'}`}
                          title={item.precio_fiable ? 'Ver historial' : AVISO_NO_FIABLE}
                          onClick={() => onVerHistorial(item)}
                        >
                          {!item.precio_fiable && '⚠ '}{formatoEuros(item.precio_actual)}
                        </button>
                      ) : <span className="texto-suave">–</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
