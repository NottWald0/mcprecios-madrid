import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './App.css';
import TablaPosicion from './components/TablaPosicion';
import TablaTodos from './components/TablaTodos';
import ModalHistorial from './components/ModalHistorial';
import ModalProducto from './components/ModalProducto';
import {
  API_URL, DIAS_PRECIO_ACTUAL, SIN_CATEGORIA, UN_DIA, calcularEvolucion, calcularMercado, descargarCSV,
  formatoFecha, nombreCorto, ordenarCategorias, puntosHistorial
} from './utils/precios';

const TODAS = 'Todas';
const CLAVE_MI_RESTAURANTE = 'miRestaurante';

// localStorage puede no estar disponible (modo privado, bloqueos...): la web funciona igual sin él
const leerPreferencia = (clave) => { try { return localStorage.getItem(clave); } catch { return null; } };
const guardarPreferencia = (clave, valor) => {
  try { valor ? localStorage.setItem(clave, valor) : localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
};

// Ordena las filas por la columna elegida; los valores vacíos siempre al final
const ordenarFilas = (filas, { campo, dir }) => {
  const signo = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'string') return signo * va.localeCompare(vb, 'es');
    return signo * (va - vb) || a.producto.localeCompare(b.producto, 'es');
  });
};

function App() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [miRestaurante, setMiRestaurante] = useState(() => leerPreferencia(CLAVE_MI_RESTAURANTE));
  const [vista, setVista] = useState('posicion');
  const [categoria, setCategoria] = useState(TODAS);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(null);
  const [orden, setOrden] = useState({ campo: 'difPct', dir: 'desc' });

  // Modal de historial de un producto en un restaurante
  const [itemHistorial, setItemHistorial] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState(null);

  // Modal de un producto en todos los restaurantes
  const [productoAbierto, setProductoAbierto] = useState(null);
  const [evolucion, setEvolucion] = useState([]);
  const [cargandoEvolucion, setCargandoEvolucion] = useState(false);
  const [errorEvolucion, setErrorEvolucion] = useState(null);

  // Cargar productos al arrancar
  useEffect(() => {
    axios.get(`${API_URL}/api/productos`)
      .then(res => {
        // Cada restaurante escribe algunos nombres con mayúsculas distintas ("Capuccino Grande" /
        // "Capuccino grande"): los agrupo usando el primer nombre que aparece para ese producto
        const nombreComun = new Map();
        const lista = Array.isArray(res.data)
          ? res.data.map(p => {
              const clave = p.nombre_producto.toLowerCase().replace(/\s+/g, ' ').trim();
              if (!nombreComun.has(clave)) nombreComun.set(clave, p.nombre_producto);
              return {
                ...p,
                nombre_producto: nombreComun.get(clave),
                precio_actual: parseFloat(p.precio_actual) || 0,
                precio_fiable: p.precio_fiable !== false
              };
            })
          : [];
        setProductos(lista);
      })
      .catch(err => {
        console.error(err);
        setError('No se han podido cargar los precios. Inténtalo de nuevo en unos minutos.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Cerrar los modales con la tecla Escape
  useEffect(() => {
    if (!itemHistorial && !productoAbierto) return;
    const onKey = e => { if (e.key === 'Escape') cerrarModales(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [itemHistorial, productoAbierto]);

  // Precios actuales: solo los restaurantes leídos recientemente. Los que llevan más tiempo
  // sin leerse no aparecen (su último precio sería antiguo), pero su histórico se conserva.
  const productosActuales = useMemo(() => {
    const ultimaLectura = new Map();
    productos.forEach(p => {
      const t = new Date(p.fecha_actual).getTime();
      if (!(ultimaLectura.get(p.nombre_restaurante) >= t)) ultimaLectura.set(p.nombre_restaurante, t);
    });
    const masReciente = Math.max(...ultimaLectura.values());
    return productos.filter(p => ultimaLectura.get(p.nombre_restaurante) >= masReciente - DIAS_PRECIO_ACTUAL * UN_DIA);
  }, [productos]);

  const restaurantes = useMemo(
    () => [...new Set(productosActuales.map(p => p.nombre_restaurante))].sort((a, b) => a.localeCompare(b, 'es')),
    [productosActuales]
  );

  // Si el restaurante guardado ya no tiene precios actuales, se trata como si no hubiera ninguno elegido
  const miRestauranteValido = restaurantes.includes(miRestaurante) ? miRestaurante : null;

  const mercado = useMemo(
    () => calcularMercado(productosActuales, miRestauranteValido),
    [productosActuales, miRestauranteValido]
  );

  const categorias = useMemo(() => ordenarCategorias([...new Set(mercado.map(m => m.categoria))]), [mercado]);

  const ultimaActualizacion = useMemo(() => {
    const fechas = productosActuales.map(p => new Date(p.fecha_actual).getTime()).filter(Number.isFinite);
    return fechas.length ? new Date(Math.max(...fechas)) : null;
  }, [productosActuales]);

  // Filas visibles: categoría + búsqueda (+ estado si se ha pulsado un resumen) y orden elegido
  const filasCategoria = mercado
    .filter(m => categoria === TODAS || m.categoria === categoria)
    .filter(m => m.producto.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const resumenEstados = { arriba: 0, media: 0, abajo: 0 };
  filasCategoria.forEach(m => { if (m.estado) resumenEstados[m.estado] += 1; });
  const ordenEfectivo = !miRestauranteValido && ['miPrecio', 'difPct', 'posicion'].includes(orden.campo)
    ? { campo: 'producto', dir: 'asc' }
    : orden;
  const filasVisibles = ordenarFilas(
    // El filtro por estado solo se muestra (y solo se aplica) en la vista "Mi posición"
    filasCategoria.filter(m => vista !== 'posicion' || !filtroEstado || m.estado === filtroEstado),
    ordenEfectivo
  );

  const restaurantesMatriz = miRestauranteValido
    ? [miRestauranteValido, ...restaurantes.filter(r => r !== miRestauranteValido)]
    : restaurantes;

  const elegirRestaurante = (valor) => {
    setMiRestaurante(valor || null);
    guardarPreferencia(CLAVE_MI_RESTAURANTE, valor);
    setFiltroEstado(null);
    setOrden(valor ? { campo: 'difPct', dir: 'desc' } : { campo: 'producto', dir: 'asc' });
  };

  const ordenarPor = (campo) => setOrden(prev => ({
    campo,
    dir: prev.campo === campo ? (prev.dir === 'asc' ? 'desc' : 'asc') : (campo === 'producto' ? 'asc' : 'desc')
  }));

  // Historial de un producto en un restaurante
  const verHistorial = (item) => {
    setProductoAbierto(null);
    setItemHistorial(item);
    setHistorial([]);
    setErrorHistorial(null);
    setCargandoHistorial(true);
    axios.get(`${API_URL}/api/historico/${item.id_producto}`)
      .then(res => setHistorial(puntosHistorial(res.data, item)))
      .catch(err => {
        console.error(err);
        setErrorHistorial('No se ha podido cargar el historial de este producto.');
      })
      .finally(() => setCargandoHistorial(false));
  };

  // Un producto en todos los restaurantes: precios actuales y evolución
  const verProducto = (filaMercado) => {
    setItemHistorial(null);
    setProductoAbierto(filaMercado);
    setEvolucion([]);
    setErrorEvolucion(null);
    setCargandoEvolucion(true);
    Promise.all(filaMercado.filas.map(item =>
      axios.get(`${API_URL}/api/historico/${item.id_producto}`)
        .then(res => ({ restaurante: item.nombre_restaurante, puntos: puntosHistorial(res.data, item) }))
    ))
      .then(series => setEvolucion(calcularEvolucion(series)))
      .catch(err => {
        console.error(err);
        setErrorEvolucion('No se ha podido cargar la evolución de este producto.');
      })
      .finally(() => setCargandoEvolucion(false));
  };

  const cerrarModales = () => {
    setItemHistorial(null);
    setHistorial([]);
    setErrorHistorial(null);
    setProductoAbierto(null);
    setEvolucion([]);
    setErrorEvolucion(null);
  };

  // Exporta a CSV exactamente lo que se está viendo (vista, categoría, búsqueda y orden)
  const exportar = () => {
    const fecha = new Date().toISOString().slice(0, 10);
    const sufijo = (miRestauranteValido ? nombreCorto(miRestauranteValido) : 'madrid')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const redondear = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

    if (vista === 'posicion') {
      const cabecera = ['Categoría', 'Producto'];
      if (miRestauranteValido) cabecera.push('Mi precio (€)');
      cabecera.push('Mínimo (€)', 'Mediana (€)', 'Máximo (€)');
      if (miRestauranteValido) cabecera.push('Diferencia vs mediana (€)', 'Diferencia vs mediana (%)', 'Posición');
      cabecera.push('Restaurantes con precio', 'Más barato en');
      const filas = filasVisibles.map(f => {
        const fila = [f.categoria, f.producto];
        if (miRestauranteValido) fila.push(f.mio ? f.mio.precio_actual : null);
        fila.push(f.min, redondear(f.mediana), f.max);
        if (miRestauranteValido) fila.push(f.dif, redondear(f.difPct !== null ? f.difPct * 100 : null, 1), f.posicion ? `${f.posicion} de ${f.n}` : null);
        fila.push(f.n, f.masBaratos.join(', '));
        return fila;
      });
      descargarCSV(`posicion_precios_${sufijo}_${fecha}.csv`, cabecera, filas);
    } else {
      const cabecera = ['Categoría', 'Producto', ...restaurantesMatriz];
      const filas = filasVisibles.map(f => {
        const porRestaurante = new Map(f.filas.map(item => [item.nombre_restaurante, item.precio_actual]));
        return [f.categoria, f.producto, ...restaurantesMatriz.map(r => porRestaurante.get(r) ?? null)];
      });
      descargarCSV(`precios_restaurantes_${fecha}.csv`, cabecera, filas);
    }
  };

  if (loading) return <div className="pantalla-estado">Cargando precios...</div>;
  if (error) return <div className="pantalla-estado texto-error">{error}</div>;

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-contenido">
          <div>
            <h1>Comparador de precios · McDonald's Madrid</h1>
            <p className="cabecera-sub">
              Precios de Uber Eats (delivery) en {restaurantes.length} restaurantes
              {ultimaActualizacion && <> · Actualizado el {formatoFecha(ultimaActualizacion)}</>}
            </p>
          </div>
          <label className="selector-restaurante">
            <span>Mi restaurante</span>
            <select value={miRestauranteValido || ''} onChange={e => elegirRestaurante(e.target.value)}>
              <option value="">Sin elegir (ver el mercado)</option>
              {restaurantes.map(r => <option key={r} value={r}>{nombreCorto(r)}</option>)}
            </select>
          </label>
        </div>
      </header>

      <main className="contenido">
        {itemHistorial && (
          <ModalHistorial
            item={itemHistorial}
            historial={historial}
            cargando={cargandoHistorial}
            error={errorHistorial}
            onCerrar={cerrarModales}
          />
        )}
        {productoAbierto && (
          <ModalProducto
            mercado={productoAbierto}
            miRestaurante={miRestauranteValido}
            evolucion={evolucion}
            cargando={cargandoEvolucion}
            error={errorEvolucion}
            onVerHistorial={verHistorial}
            onCerrar={cerrarModales}
          />
        )}

        <div className="barra-herramientas">
          <div className="segmentos" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={vista === 'posicion'} className={vista === 'posicion' ? 'activo' : ''} onClick={() => setVista('posicion')}>
              {miRestauranteValido ? 'Mi posición' : 'Resumen del mercado'}
            </button>
            <button role="tab" aria-selected={vista === 'todos'} className={vista === 'todos' ? 'activo' : ''} onClick={() => setVista('todos')}>
              Todos los restaurantes
            </button>
          </div>
          <input
            className="buscador"
            type="search"
            placeholder="Buscar producto"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            aria-label="Buscar producto"
          />
          <button className="boton-secundario" onClick={exportar} disabled={filasVisibles.length === 0}>
            Exportar a Excel (CSV)
          </button>
        </div>

        <div className="chips" role="tablist" aria-label="Categorías">
          {[TODAS, ...categorias].map(c => (
            <button
              key={c}
              role="tab"
              aria-selected={categoria === c}
              className={`chip ${categoria === c ? 'chip-activo' : ''}`}
              onClick={() => setCategoria(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {!miRestauranteValido && vista === 'posicion' && (
          <p className="aviso aviso-info">
            Elige <strong>tu restaurante</strong> arriba a la derecha para ver tu precio frente a la mediana de Madrid y tu posición en cada producto.
          </p>
        )}

        {miRestauranteValido && vista === 'posicion' && (
          <div className="resumen-estados">
            <span className="texto-suave">Frente a la mediana de Madrid:</span>
            {[
              ['arriba', '▲ Por encima'],
              ['media', '= En la media (±2 %)'],
              ['abajo', '▼ Por debajo']
            ].map(([estado, texto]) => (
              <button
                key={estado}
                className={`chip chip-estado estado-${estado} ${filtroEstado === estado ? 'chip-activo' : ''}`}
                onClick={() => setFiltroEstado(filtroEstado === estado ? null : estado)}
                aria-pressed={filtroEstado === estado}
              >
                {texto}: {resumenEstados[estado]}
              </button>
            ))}
          </div>
        )}

        {filasVisibles.length === 0 ? (
          <p className="sin-resultados">No hay productos que coincidan con la búsqueda o los filtros.</p>
        ) : vista === 'posicion' ? (
          <TablaPosicion
            filas={filasVisibles}
            miRestaurante={miRestauranteValido}
            orden={ordenEfectivo}
            onOrdenar={ordenarPor}
            onVerProducto={verProducto}
            onVerHistorial={verHistorial}
          />
        ) : (
          <TablaTodos
            filas={filasVisibles}
            restaurantes={restaurantesMatriz}
            miRestaurante={miRestauranteValido}
            onVerProducto={verProducto}
            onVerHistorial={verHistorial}
          />
        )}

        <p className="pie">
          Los precios son los publicados en Uber Eats y pueden no coincidir con los del restaurante.
          ⚠ indica un precio no fiable. {categoria === SIN_CATEGORIA && 'Los productos sin categoría proceden de lecturas antiguas.'}
        </p>
      </main>
    </div>
  );
}

export default App;
