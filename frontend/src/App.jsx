import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import './App.css';

// URL del backend: en local usa localhost:5000 por defecto; en producción
// (Vercel/Netlify) se define VITE_API_URL apuntando al backend desplegado.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [productos, setProductos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState(null);
  const [viewMode, setViewMode] = useState('tabla');

  const [selectedRestaurants, setSelectedRestaurants] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Cargar productos al arrancar
  useEffect(() => {
    axios.get(`${API_URL}/api/productos`)
      .then(res => {
        const lista = Array.isArray(res.data)
          ? res.data.map(p => ({
              ...p,
              precio_actual: parseFloat(p.precio_actual) || 0
            }))
          : [];
        setProductos(lista);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Error al cargar los productos');
        setLoading(false);
      });
  }, []);

  // Configurar filtros automáticamente
  useEffect(() => {
    const r = [...new Set(productos.map(p => p.nombre_restaurante))];
    const p = [...new Set(productos.map(p => p.nombre_producto))];

    if (!selectedRestaurants.length && r.length) setSelectedRestaurants(r);
    if (!selectedProducts.length && p.length) setSelectedProducts(p);
  }, [productos]);

  // Mostrar historial del producto seleccionado
  const verHistorial = (id, nombre, rest) => {
    setSelectedProducto({ idProducto: id, nombreProducto: nombre, nombreRestaurante: rest });
    setLoading(true);
    axios.get(`${API_URL}/api/historico/${id}`)
      .then(res => {
        const datos = Array.isArray(res.data)
          ? res.data.map(r => ({
              fecha: r.fecha_historico,
              precio: parseFloat(r.precio_historico) || 0
            }))
          : [];

        datos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        setHistorial(datos);
        setViewMode('tabla');
        setShowModal(true);
        setLoading(false);
      });
  };

  const cerrarModal = () => {
    setShowModal(false);
    setHistorial([]);
    setSelectedProducto(null);
  };

  const restaurantes = [...new Set(productos.map(p => p.nombre_restaurante))];
  const productosUnicos = [...new Set(productos.map(p => p.nombre_producto))];

  const filtradosRest = restaurantes.filter(r => selectedRestaurants.includes(r));
  const filtradosProd = productosUnicos
    .filter(p => selectedProducts.includes(p))
    .filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()));

  const esMasBarato = (nombre, rest) => {
    const mismos = productos.filter(p => p.nombre_producto === nombre);
    const precios = mismos.map(p => p.precio_actual).filter(n => n > 0);
    const min = Math.min(...precios);
    const actual = mismos.find(p => p.nombre_restaurante === rest);
    return actual && actual.precio_actual === min;
  };

  if (loading) return <div>Cargando datos...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div className="App">
      <h1>Comparador de Precios - McDonald's Madrid</h1>

      {/* Modal con historial */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selectedProducto.nombreProducto} - {selectedProducto.nombreRestaurante}</h2>
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

            {viewMode === 'tabla' ? (
              <table className="hist-table">
                <thead>
                  <tr><th>Fecha</th><th>Precio (€)</th></tr>
                </thead>
                <tbody>
                  {historial.map((h, i) => (
                    <tr key={i}>
                      <td>{new Date(h.fecha).toLocaleString()}</td>
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
                    <XAxis dataKey="fecha" tickFormatter={t => new Date(t).toLocaleDateString()} />
                    <YAxis />
                    <Tooltip labelFormatter={l => new Date(l).toLocaleString()} />
                    <Line type="monotone" dataKey="precio" stroke="#C8102E" />
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

      {/* Tabla de precios */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              {filtradosRest.map((r, i) => <th key={i}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtradosProd.map((prod, i) => (
              <tr key={i}>
                <td>{prod}</td>
                {filtradosRest.map((rest, j) => {
                  const item = productos.find(p => p.nombre_restaurante === rest && p.nombre_producto === prod);
                  return (
                    <td key={j}>
                      {item ? (
                        <button
                          className={`price-button ${esMasBarato(prod, rest) ? 'precio-mas-bajo' : ''}`}
                          onClick={() => verHistorial(item.id_producto, item.nombre_producto, item.nombre_restaurante)}
                        >
                          {item.precio_actual.toFixed(2)} €
                        </button>
                      ) : ('-')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
