import React from 'react';
import { AVISO_NO_FIABLE, formatoDiferencia, formatoEuros, formatoPorcentaje } from '../utils/precios';

const ETIQUETA_ESTADO = { arriba: 'Por encima', abajo: 'Por debajo', media: 'En la media' };
const ICONO_ESTADO = { arriba: '▲', abajo: '▼', media: '=' };

function Estado({ fila }) {
  if (!fila.estado) return <span className="texto-suave">–</span>;
  return (
    <span className={`estado estado-${fila.estado}`} title={ETIQUETA_ESTADO[fila.estado]}>
      <span aria-hidden="true">{ICONO_ESTADO[fila.estado]}</span> {formatoPorcentaje(fila.difPct)}
      <span className="estado-euros">{formatoDiferencia(fila.dif)}</span>
    </span>
  );
}

function MiPrecio({ fila, onVerHistorial }) {
  if (!fila.mio) return <span className="texto-suave" title="Tu restaurante no tiene este producto en Uber Eats">–</span>;
  return (
    <button
      className="precio-enlace"
      title={fila.mio.precio_fiable ? 'Ver historial en tu restaurante' : AVISO_NO_FIABLE}
      onClick={() => onVerHistorial(fila.mio)}
    >
      {!fila.mio.precio_fiable && '⚠ '}{formatoEuros(fila.mio.precio_actual)}
    </button>
  );
}

function Cabecera({ campo, children, orden, onOrdenar, className = '' }) {
  const activo = orden.campo === campo;
  return (
    <th className={className} aria-sort={activo ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`orden ${activo ? 'orden-activo' : ''}`} onClick={() => onOrdenar(campo)}>
        {children}<span aria-hidden="true">{activo ? (orden.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  );
}

// Tabla principal para hacer pricing: cada producto frente al mercado de Madrid
export default function TablaPosicion({ filas, miRestaurante, orden, onOrdenar, onVerProducto, onVerHistorial }) {
  const conMio = Boolean(miRestaurante);
  const props = { orden, onOrdenar };

  return (
    <>
      <div className="tabla-contenedor solo-escritorio">
        <table className="tabla">
          <thead>
            <tr>
              <Cabecera campo="producto" className="col-producto" {...props}>Producto</Cabecera>
              {conMio && <Cabecera campo="miPrecio" className="num col-mio" {...props}>Mi precio</Cabecera>}
              <Cabecera campo="min" className="num" {...props}>Mínimo</Cabecera>
              <Cabecera campo="mediana" className="num" {...props}>Mediana</Cabecera>
              <Cabecera campo="max" className="num" {...props}>Máximo</Cabecera>
              {conMio
                ? <Cabecera campo="difPct" className="num" {...props}>Vs mediana</Cabecera>
                : <Cabecera campo="rangoPct" className="num" {...props}>Diferencia máx.</Cabecera>}
              {conMio
                ? <Cabecera campo="posicion" className="num" {...props}>Posición</Cabecera>
                : <Cabecera campo="n" className="num" {...props}>Restaurantes</Cabecera>}
              <th>Más barato en</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.producto}>
                <td className="col-producto">
                  <button className="producto-enlace" onClick={() => onVerProducto(f)} title="Comparar en todos los restaurantes">
                    {f.producto}
                  </button>
                </td>
                {conMio && <td className="num col-mio"><MiPrecio fila={f} onVerHistorial={onVerHistorial} /></td>}
                <td className="num">{f.min !== null ? formatoEuros(f.min) : '–'}</td>
                <td className="num">{f.mediana !== null ? formatoEuros(f.mediana) : '–'}</td>
                <td className="num">{f.max !== null ? formatoEuros(f.max) : '–'}</td>
                {conMio
                  ? <td className="num"><Estado fila={f} /></td>
                  : <td className="num">{f.rangoPct !== null ? formatoPorcentaje(f.rangoPct) : '–'}</td>}
                {conMio
                  ? <td className="num">{f.posicion ? `${f.posicion}º de ${f.n}` : '–'}</td>
                  : <td className="num">{f.n}</td>}
                <td className="col-barato" title={f.masBaratos.join(', ')}>
                  {f.masBaratos[0] || '–'}{f.masBaratos.length > 1 && <span className="texto-suave"> y {f.masBaratos.length - 1} más</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="tarjetas solo-movil">
        {filas.map(f => (
          <li key={f.producto}>
            <button className="tarjeta" onClick={() => onVerProducto(f)}>
              <span className="tarjeta-titulo">{f.producto}</span>
              {conMio && f.mio ? (
                <span className="tarjeta-linea">
                  <span>Mi precio <strong>{!f.mio.precio_fiable && '⚠ '}{formatoEuros(f.mio.precio_actual)}</strong></span>
                  <Estado fila={f} />
                </span>
              ) : null}
              <span className="tarjeta-linea texto-suave">
                <span>Mediana {f.mediana !== null ? formatoEuros(f.mediana) : '–'}</span>
                <span>{f.min !== null ? `${formatoEuros(f.min)} – ${formatoEuros(f.max)}` : '–'}</span>
              </span>
              <span className="tarjeta-linea texto-suave">
                <span>Más barato: {f.masBaratos[0] || '–'}{f.masBaratos.length > 1 && ` y ${f.masBaratos.length - 1} más`}</span>
                {conMio && f.posicion && <span>{f.posicion}º de {f.n}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
