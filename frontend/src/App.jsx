import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import './App.css';

// URL del backend: en local usa localhost:5000 por defecto; en producción
// (Vercel/Netlify) se define VITE_API_URL apuntando al backend desplegado.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const AVISO_NO_FIABLE =
  'Precio no fiable: Uber Eats muestra varios artículos con este mismo nombre (por ejemplo, suelto y en oferta) y el scraper no podía distinguirlos.';

// "McDonald's Plaza Castilla" -> "Plaza Castilla", para que quepa en la cabecera de la tabla
const nombreCorto = (restaurante) => restaurante.replace(/^McDonald'?s\s*/i, '');

const formatoEuros = (n) => `${n.toFixed(2)} €`;
const formatoFecha = (f) => new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const formatoFechaHora = (f) => new Date(f).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

function App() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRestaurants, setSelectedRestaurants] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Estado del modal de historial (tiene su propia carga y su propio error,
  // así la tabla principal no desaparece mientras se consulta el historial)
  const [selectedProducto, setSelectedProducto] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState(null);
  const [viewMode, setViewMode] = useState('tabla');

  // Cargar productos al arrancar
  useEffect(() => {
    axios.get(`${API_URL}/api/productos`)
      .then(res => {
        const lista = Array.isArray(res.data)
          ? res.data.map(p => ({
              ...p,
              precio_actual: parseFloat(p.precio_actual) || 0,
              precio_fiable: p.precio_fiable !== false
            }))
          : [];
        setProductos(lista);
        setSelectedRestaurants([...new Set(lista.map(p => p.nombre_restaurante))]);
        setSelectedProducts([...new Set(lista.map(p => p.nombre_producto))]);
      })
      .catch(err => {
        console.error(err);
        setError('No se han podido cargar los productos. Inténtalo de nuevo en unos minutos.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Cerrar el modal con la tecla Escape
  useEffect(() => {
    if (!selectedProducto) return;
    const onKey = e => { if (e.key === 'Escape') cerrarModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedProducto]);

  const restaurantes = useMemo(() => [...new Set(productos.map(p => p.nombre_restaurante))], [productos]);
  const productosUnicos = useMemo(() => [...new Set(productos.map(p => p.nombre_producto))], [productos]);

  // Índice producto+restaurante -> fila, para no recorrer la lista entera en cada celda
  const porCelda = useMemo(() => {
    const mapa = new Map();
    productos.forEach(p => mapa.set(`${p.nombre_producto}|${p.nombre_restaurante}`, p));
    return mapa;
  }, [productos]);

  // Precio mínimo de cada producto, contando solo los precios fiables
  const minimoPorProducto = useMemo(() => {
    const minimos = new Map();
    productos.forEach(p => {
      if (!p.precio_fiable || p.precio_actual <= 0) return;
      const actual = minimos.get(p.nombre_producto);
      if (actual === undefined || p.precio_actual < actual) minimos.set(p.nombre_producto, p.precio_actual);
    });
    return minimos;
  }, [productos]);

  const ultimaActualizacion = useMemo(() => {
    const fechas = productos.map(p => new Date(p.fecha_actual).getTime()).filter(Number.isFinite);
    return fechas.length ? new Date(Math.max(...fechas)) : null;
  }, [productos]);

  // Mostrar historial del producto seleccionado
  const verHistorial = (item) => {
    setSelectedProducto(item);
    setHistorial([]);
    setErrorHistorial(null);
    setViewMode('tabla');
    setLoadingHistorial(true);
    axios.get(`${API_URL}/api/historico/${item.id_producto}`)
      .then(res => {
        const datos = Array.isArray(res.data)
          ? res.data.map(r => ({
              fecha: r.fecha_historico,
              precio: parseFloat(r.precio_historico) || 0,
              actual: false
            }))
          : [];
        // El histórico guarda los precios anteriores; el precio actual está en otra tabla,
        // así que lo añado al final para que la gráfica llegue hasta hoy
        datos.push({ fecha: item.fecha_actual, precio: item.precio_actual, actual: true });
        datos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        setHistorial(datos);
      })
      .catch(err => {
        console.error(err);
        setErrorHistorial('No se ha podido cargar el historial de este producto.');
      })
      .finally(() => setLoadingHistorial(false));
  };

  const cerrarModal = () => {
    setSelectedProducto(null);
    setHistorial([]);
    setErrorHistorial(null);
  };

  const filtradosRest = restaurantes.filter(r => selectedRestaurants.includes(r));
  const filtradosProd = productosUnicos
    .filter(p => selectedProducts.includes(p))
    .filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="estado">Cargando datos...</div>;
  if (error) return <div className="estado estado-error">{error}</div>;

  return (
    <div className="App">
      <h1>Comparador de Precios - McDonald's Madrid</h1>
      {ultimaActualizacion && (
        <p className="subtitulo">
          Precios de Uber Eats en {restaurantes.length} restaurantes · Última actualización: {formatoFecha(ultimaActualizacion)}
        </p>
      )}

      {/* Modal con historial */}
      {selectedProducto && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2>{selectedProducto.nombre_producto} - {selectedProducto.nombre_restaurante}</h2>

            {!selectedProducto.precio_fiable && <p className="aviso">⚠ {AVISO_NO_FIABLE}</p>}

            <div className="hist-controls">
              <button
                className={viewMode === 'tabla' ? 'active' : ''}
                onClick={() => setViewMode('tabla')}
              >Tabla</button>
              <button
                className={viewMode === 'grafico' ? 'active' : ''}
                onClick={() => setViewMode('grafico')}
              >Gráfico</button>
            </div>

            {loadingHistorial ? (
              <p className="estado-modal">Cargando historial...</p>
            ) : errorHistorial ? (
              <p className="estado-modal estado-error">{errorHistorial}</p>
            ) : viewMode === 'tabla' ? (
              <table className="hist-table">
                <thead>
                  <tr><th>Fecha</th><th>Precio (€)</th></tr>
                </thead>
                <tbody>
                  {[...historial].reverse().map((h, i) => (
                    <tr key={i} className={h.actual ? 'fila-actual' : ''}>
                      <td>{formatoFechaHora(h.fecha)}{h.actual && ' (actual)'}</td>
                      <td>{h.precio.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={historial}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" tickFormatter={t => new Date(t).toLocaleDateString('es-ES')} minTickGap={20} />
                    <YAxis domain={['auto', 'auto']} tickFormatter={v => `${v.toFixed(2)} €`} width={70} />
                    <Tooltip
                      labelFormatter={l => formatoFechaHora(l)}
                      formatter={v => [formatoEuros(v), 'Precio']}
                    />
                    <Line type="stepAfter" dataKey="precio" stroke="#C8102E" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <button className="close-button" onClick={cerrarModal}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filters">
        <details className="filter-group">
          <summary>Filtrar Restaurantes</summary>
          <label className="dropdown-item" style={{ fontWeight: 'bold' }}>
            <input
              type="checkbox"
              checked={selectedRestaurants.length === restaurantes.length && restaurantes.length > 0}
              onChange={e => {
                setSelectedRestaurants(e.target.checked ? restaurantes : []);
              }}
            /> Seleccionar todo
          </label>
          {restaurantes.map((rest, i) => (
            <label key={i} className="dropdown-item">
              <input
                type="checkbox"
                value={rest}
                checked={selectedRestaurants.includes(rest)}
                onChange={e => {
                  const { checked, value } = e.target;
                  setSelectedRestaurants(prev =>
                    checked ? [...prev, value] : prev.filter(r => r !== value)
                  );
                }}
              /> {rest}
            </label>
          ))}
        </details>

        <details className="filter-group">
          <summary>Filtrar Productos</summary>
          <label className="dropdown-item" style={{ fontWeight: 'bold' }}>
            <input
              type="checkbox"
              checked={selectedProducts.length === productosUnicos.length && productosUnicos.length > 0}
              onChange={e => {
                setSelectedProducts(e.target.checked ? productosUnicos : []);
              }}
            /> Seleccionar todo
          </label>
          {productosUnicos.map((prod, i) => (
            <label key={i} className="dropdown-item">
              <input
                type="checkbox"
                value={prod}
                checked={selectedProducts.includes(prod)}
                onChange={e => {
                  const { checked, value } = e.target;
                  setSelectedProducts(prev =>
                    checked ? [...prev, value] : prev.filter(p => p !== value)
                  );
                }}
              /> {prod}
            </label>
          ))}
        </details>
      </div>

      {/* Búsqueda */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="leyenda">
        <span><span className="muestra muestra-barato" /> Precio más bajo</span>
        <span><span className="muestra" /> Otros precios</span>
        <span>⚠ Precio no fiable</span>
        <span>Pulsa un precio para ver su historial</span>
      </div>

      {/* Tabla de precios */}
      <div className="table-container">
        {filtradosProd.length === 0 || filtradosRest.length === 0 ? (
          <p className="sin-resultados">No hay productos que coincidan con la búsqueda o los filtros.</p>
        ) : (
          <table className="tabla-precios">
            <thead>
              <tr>
                <th className="col-producto">Producto</th>
                {filtradosRest.map((r, i) => <th key={i} title={r}>{nombreCorto(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtradosProd.map((prod, i) => (
                <tr key={i}>
                  <td className="col-producto" title={prod}>{prod}</td>
                  {filtradosRest.map((rest, j) => {
                    const item = porCelda.get(`${prod}|${rest}`);
                    const esMasBarato = item && item.precio_fiable && item.precio_actual === minimoPorProducto.get(prod);
                    return (
                      <td key={j}>
                        {item ? (
                          <button
                            className={`price-button ${esMasBarato ? 'precio-mas-bajo' : ''} ${item.precio_fiable ? '' : 'no-fiable'}`}
                            title={item.precio_fiable ? 'Ver historial' : AVISO_NO_FIABLE}
                            onClick={() => verHistorial(item)}
                          >
                            {!item.precio_fiable && '⚠ '}{formatoEuros(item.precio_actual)}
                          </button>
                        ) : ('-')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default App;
