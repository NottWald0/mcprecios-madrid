import React from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  AVISO_NO_FIABLE, DOMINIO_PRECIO, dominioTiempo, formatoEje, formatoEuros, formatoFecha,
  formatoPorcentaje, nombreCorto
} from '../utils/precios';

function TooltipEvolucion({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tooltip-grafico">
      <strong>{formatoFecha(d.t)}</strong>
      <div>Precio medio: {formatoEuros(d.media)}</div>
      <div>Mínimo: {formatoEuros(d.rango[0])} · Máximo: {formatoEuros(d.rango[1])}</div>
      <div className="texto-suave">{d.restaurantes} restaurantes con precio</div>
    </div>
  );
}

// Un producto en todos los restaurantes: precios actuales, posición del restaurante propio y evolución
export default function ModalProducto({ mercado, miRestaurante, evolucion, cargando, error, onVerHistorial, onCerrar }) {
  const filas = [...mercado.filas].sort((a, b) => a.precio_actual - b.precio_actual);
  const precioMax = Math.max(...filas.map(f => f.precio_actual));

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-ancho" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <p className="modal-etiqueta">{mercado.categoria}</p>
        <h2>{mercado.producto}</h2>

        <div className="resumen-kpis">
          <div className="kpi"><span>Mínimo</span><strong>{mercado.min !== null ? formatoEuros(mercado.min) : '–'}</strong></div>
          <div className="kpi"><span>Mediana</span><strong>{mercado.mediana !== null ? formatoEuros(mercado.mediana) : '–'}</strong></div>
          <div className="kpi"><span>Máximo</span><strong>{mercado.max !== null ? formatoEuros(mercado.max) : '–'}</strong></div>
          {mercado.miPrecio !== null ? (
            <div className={`kpi kpi-${mercado.estado}`}>
              <span>{nombreCorto(miRestaurante)}</span>
              <strong>{formatoEuros(mercado.miPrecio)}</strong>
              <em>{formatoPorcentaje(mercado.difPct)} vs mediana · {mercado.posicion}º de {mercado.n}</em>
            </div>
          ) : (
            <div className="kpi"><span>Restaurantes</span><strong>{mercado.n}</strong></div>
          )}
        </div>

        <h3>Precio actual en cada restaurante</h3>
        <ul className="lista-precios">
          {filas.map(f => {
            const esMio = f.nombre_restaurante === miRestaurante;
            const esMin = f.precio_fiable && f.precio_actual === mercado.min;
            return (
              <li key={f.id_producto}>
                <button
                  className={`fila-precio ${esMio ? 'fila-mia' : ''}`}
                  title={f.precio_fiable ? 'Ver historial en este restaurante' : AVISO_NO_FIABLE}
                  onClick={() => onVerHistorial(f)}
                >
                  <span className="fila-nombre" title={f.nombre_restaurante}>
                    {nombreCorto(f.nombre_restaurante)}{esMio && <span className="etiqueta-tu">Tú</span>}
                  </span>
                  <span className="fila-barra">
                    <span
                      className={`barra ${esMin ? 'barra-min' : ''} ${esMio ? 'barra-mia' : ''} ${f.precio_fiable ? '' : 'barra-no-fiable'}`}
                      style={{ width: `${(f.precio_actual / precioMax) * 100}%` }}
                    />
                  </span>
                  <span className="fila-valor">{!f.precio_fiable && '⚠ '}{formatoEuros(f.precio_actual)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <h3>Evolución del precio en Madrid</h3>
        {cargando ? (
          <p className="estado-modal">Cargando evolución...</p>
        ) : error ? (
          <p className="estado-modal texto-error">{error}</p>
        ) : evolucion.length < 2 ? (
          <p className="nota">
            Por ahora solo hay precios de una fecha ({evolucion[0] ? formatoFecha(evolucion[0].t) : '–'}).
            La evolución se irá completando cada vez que se actualicen los precios.
          </p>
        ) : (
          <div className="grafico">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={evolucion} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#efe2c2" />
                <XAxis
                  dataKey="t" type="number" scale="time"
                  domain={dominioTiempo(evolucion.map(e => e.t))}
                  tickFormatter={formatoEje} minTickGap={24} stroke="#8a7a5c"
                />
                <YAxis domain={DOMINIO_PRECIO} tickFormatter={formatoEuros} width={70} stroke="#8a7a5c" />
                <Tooltip content={<TooltipEvolucion />} />
                <Legend />
                <Area type="linear" dataKey="rango" name="Rango entre restaurantes (mín.–máx.)" legendType="square" fill="#C8102E" fillOpacity={0.15} stroke="none" isAnimationActive={false} />
                <Line type="linear" dataKey="media" name="Precio medio" stroke="#C8102E" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="nota">Pulsa un restaurante para ver el historial completo de este producto en él.</p>
        <button className="boton-cerrar" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}
