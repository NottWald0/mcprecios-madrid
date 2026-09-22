import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  AVISO_NO_FIABLE, DOMINIO_PRECIO, dominioTiempo, formatoEje, formatoEuros, formatoFechaHora
} from '../utils/precios';

// Historial de precios de un producto en un restaurante
export default function ModalHistorial({ item, historial, cargando, error, onCerrar }) {
  const [vista, setVista] = useState('tabla');

  // El gráfico solo usa lecturas fiables (si no queda ninguna, muestra todas)
  const historialFiable = historial.some(h => !h.ambigua) ? historial.filter(h => !h.ambigua) : historial;

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <p className="modal-etiqueta">Historial de precios</p>
        <h2>{item.nombre_producto}</h2>
        <p className="modal-sub">{item.nombre_restaurante}</p>

        {!item.precio_fiable && <p className="aviso">⚠ {AVISO_NO_FIABLE}</p>}
        {item.precio_fiable && historial.some(h => h.ambigua) && (
          <p className="aviso">
            ⚠ Las lecturas marcadas no son fiables: el scraper antiguo mezclaba varios artículos con este mismo
            nombre y el precio parecía cambiar varias veces en segundos. No se muestran en el gráfico.
          </p>
        )}

        <div className="segmentos">
          <button className={vista === 'tabla' ? 'activo' : ''} onClick={() => setVista('tabla')}>Tabla</button>
          <button className={vista === 'grafico' ? 'activo' : ''} onClick={() => setVista('grafico')}>Gráfico</button>
        </div>

        {cargando ? (
          <p className="estado-modal">Cargando historial...</p>
        ) : error ? (
          <p className="estado-modal texto-error">{error}</p>
        ) : vista === 'tabla' ? (
          <table className="tabla-historial">
            <thead>
              <tr><th>Fecha</th><th className="num">Precio</th></tr>
            </thead>
            <tbody>
              {[...historial].reverse().map((h, i) => (
                <tr key={i} className={`${h.actual ? 'fila-actual' : ''} ${h.ambigua ? 'fila-ambigua' : ''}`}>
                  <td>{formatoFechaHora(h.t)}{h.actual && ' · actual'}</td>
                  <td className="num">{h.ambigua && '⚠ '}{formatoEuros(h.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grafico">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={historialFiable} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#efe2c2" />
                <XAxis
                  dataKey="t" type="number" scale="time"
                  domain={dominioTiempo(historialFiable.map(h => h.t))}
                  tickFormatter={formatoEje} minTickGap={24} stroke="#8a7a5c"
                />
                <YAxis domain={DOMINIO_PRECIO} tickFormatter={formatoEuros} width={70} stroke="#8a7a5c" />
                <Tooltip labelFormatter={l => formatoFechaHora(l)} formatter={v => [formatoEuros(v), 'Precio']} />
                <Line type="stepAfter" dataKey="precio" stroke="#C8102E" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <button className="boton-cerrar" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}
