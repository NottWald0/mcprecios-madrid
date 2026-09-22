// URL del backend: en local usa localhost:5000 por defecto; en producción
// (Vercel/Netlify) se define VITE_API_URL apuntando al backend desplegado.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const AVISO_NO_FIABLE =
  'Precio no fiable: Uber Eats muestra varios artículos con este mismo nombre (por ejemplo, suelto y en oferta) y el scraper no podía distinguirlos.';

// Solo se consideran "actuales" los restaurantes leídos como mucho 30 días antes de la lectura más reciente
export const DIAS_PRECIO_ACTUAL = 30;
export const UN_DIA = 24 * 60 * 60 * 1000;

// Margen para considerar que un precio está "en la media" (±2 % de la mediana)
export const MARGEN_MEDIA = 0.02;

export const SIN_CATEGORIA = 'Otros';

// Orden en el que aparecen las categorías (el de la carta de Uber Eats); las demás, detrás
const ORDEN_CATEGORIAS = [
  'McMenú®', 'Novedades', 'Menú Golazo', 'Packs para compartir', 'Menú infantil', 'Complementos',
  'Ensaladas y Menús Ensaladas', 'Bebidas Frías', 'Bebidas McCafé®', 'Dulces y Salados McCafé®',
  'Postres y Helados', 'Salsas'
];

export const ordenarCategorias = (categorias) => [...categorias].sort((a, b) => {
  const ia = ORDEN_CATEGORIAS.indexOf(a);
  const ib = ORDEN_CATEGORIAS.indexOf(b);
  if (a === SIN_CATEGORIA || b === SIN_CATEGORIA) return a === SIN_CATEGORIA ? 1 : -1;
  if (ia === -1 && ib === -1) return a.localeCompare(b, 'es');
  if (ia === -1 || ib === -1) return ia === -1 ? 1 : -1;
  return ia - ib;
});

// "McDonald's Plaza Castilla" -> "Plaza Castilla"
export const nombreCorto = (restaurante) => restaurante.replace(/^McDonald'?s\s*/i, '');

const numero = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatoEuros = (n) => `${numero.format(n)} €`;
export const formatoDiferencia = (n) => `${n > 0 ? '+' : ''}${numero.format(n)} €`;
export const formatoPorcentaje = (n) => `${n > 0 ? '+' : ''}${Math.round(n * 100)} %`;
export const formatoFecha = (f) => new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatoFechaHora = (f) => new Date(f).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
export const formatoEje = (t) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });

// Dominio del eje de tiempo; si solo hay una fecha, dejo un día de margen a cada lado
export const dominioTiempo = (tiempos) => {
  const min = Math.min(...tiempos);
  const max = Math.max(...tiempos);
  return min === max ? [min - UN_DIA, max + UN_DIA] : [min, max];
};

// Eje de precios redondeado a múltiplos de 0,50 € para que las marcas sean cifras "limpias"
export const DOMINIO_PRECIO = [min => Math.max(0, Math.floor(min * 2) / 2 - 0.5), max => Math.ceil(max * 2) / 2 + 0.5];

const diaDe = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const mediana = (valores) => {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Convierte la respuesta de /api/historico + el precio actual en puntos ordenados por fecha
export const puntosHistorial = (respuesta, item) => {
  const puntos = (Array.isArray(respuesta) ? respuesta : []).map(r => ({
    t: new Date(r.fecha_historico).getTime(),
    precio: parseFloat(r.precio_historico) || 0,
    actual: false,
    ambigua: Boolean(r.lectura_ambigua)
  }));
  // El histórico guarda los precios anteriores; el precio actual está en otra tabla,
  // así que lo añado al final para que la gráfica llegue hasta la última lectura
  puntos.push({ t: new Date(item.fecha_actual).getTime(), precio: item.precio_actual, actual: true, ambigua: !item.precio_fiable });
  return puntos.sort((a, b) => a.t - b.t);
};

// Para cada día con alguna lectura, precio mínimo, medio y máximo entre los restaurantes
// (en cada restaurante se toma el último precio fiable conocido hasta ese día)
export const calcularEvolucion = (seriesCompletas) => {
  const series = seriesCompletas
    .map(s => ({ ...s, puntos: s.puntos.filter(p => !p.ambigua) }))
    .filter(s => s.puntos.length > 0);
  const dias = [...new Set(series.flatMap(s => s.puntos.map(p => diaDe(p.t))))].sort();
  return dias.map(dia => {
    const finDelDia = new Date(`${dia}T23:59:59`).getTime();
    const precios = series
      .map(s => s.puntos.filter(p => p.t <= finDelDia).at(-1)?.precio)
      .filter(p => p !== undefined);
    const media = precios.reduce((a, b) => a + b, 0) / precios.length;
    return {
      t: new Date(`${dia}T12:00:00`).getTime(),
      media: Math.round(media * 100) / 100,
      rango: [Math.min(...precios), Math.max(...precios)],
      restaurantes: precios.length
    };
  });
};

// Resumen de mercado de cada producto: mínimo, mediana, máximo y, si hay restaurante
// propio, su precio, la diferencia con la mediana y su posición. Solo cuentan precios fiables.
export const calcularMercado = (productosActuales, miRestaurante) => {
  const porProducto = new Map();
  productosActuales.forEach(p => {
    if (!porProducto.has(p.nombre_producto)) porProducto.set(p.nombre_producto, []);
    porProducto.get(p.nombre_producto).push(p);
  });

  return [...porProducto.entries()].map(([producto, filas]) => {
    // Categoría: la más habitual entre los restaurantes que tienen el producto
    const cuenta = new Map();
    filas.forEach(f => f.categoria && cuenta.set(f.categoria, (cuenta.get(f.categoria) || 0) + 1));
    const categoria = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || SIN_CATEGORIA;

    const fiables = filas.filter(f => f.precio_fiable && f.precio_actual > 0).sort((a, b) => a.precio_actual - b.precio_actual);
    const precios = fiables.map(f => f.precio_actual);
    const min = precios.length ? precios[0] : null;
    const max = precios.length ? precios.at(-1) : null;
    const med = mediana(precios);
    const mio = miRestaurante ? filas.find(f => f.nombre_restaurante === miRestaurante) : undefined;
    const miPrecio = mio && mio.precio_fiable ? mio.precio_actual : null;

    let dif = null, difPct = null, posicion = null, estado = null;
    if (miPrecio !== null && med !== null) {
      dif = Math.round((miPrecio - med) * 100) / 100;
      difPct = miPrecio / med - 1;
      posicion = precios.filter(p => p < miPrecio).length + 1;
      estado = difPct > MARGEN_MEDIA ? 'arriba' : difPct < -MARGEN_MEDIA ? 'abajo' : 'media';
    }

    return {
      producto,
      categoria,
      filas,
      fiables,
      n: precios.length,
      min,
      mediana: med,
      max,
      rangoPct: min ? max / min - 1 : null,
      masBaratos: fiables.filter(f => f.precio_actual === min).map(f => nombreCorto(f.nombre_restaurante)),
      mio,
      miPrecio,
      dif,
      difPct,
      posicion,
      estado
    };
  });
};

// Descarga un CSV preparado para Excel en español: separador ";", coma decimal y BOM UTF-8
export const descargarCSV = (nombreArchivo, cabecera, filas) => {
  const celda = (v) => {
    if (v === null || v === undefined) return '';
    const texto = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const contenido = [cabecera, ...filas].map(f => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
};
