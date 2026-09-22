# ComparadorDePrecios

Herramienta de apoyo al **pricing** para gerentes de restaurantes McDonald's de
Madrid. Recoge los precios publicados en Uber Eats por los distintos
restaurantes de Madrid, guarda su histórico y los muestra en una web para que
cada gerente vea, sin buscarlo a mano, cómo están sus precios frente al resto.

- **Scraping**: Python + Selenium (Chrome o Edge)
- **Backend**: Node.js + Express + MySQL
- **Frontend**: React + Vite + Recharts

## Qué ofrece la web

- **Mi restaurante**: el gerente elige su restaurante (se recuerda en el navegador).
- **Mi posición**: por cada producto, su precio frente al mínimo, la mediana y el
  máximo de Madrid, la diferencia con la mediana (€ y %) y su posición
  ("4º de 13"). Se puede ordenar por cualquier columna y filtrar los productos
  que están por encima, en la media (±2 %) o por debajo de la mediana.
- **Todos los restaurantes**: matriz producto × restaurante con el precio actual
  de cada uno; el restaurante propio aparece en la primera columna.
- **Categorías** (McMenú®, Complementos, Bebidas…) y buscador.
- **Detalle de un producto**: precio en cada restaurante y evolución del precio
  medio en Madrid; pulsando un precio, su historial en ese restaurante.
- **Exportar a Excel (CSV)** exactamente lo que se está viendo.
- Solo se muestran los **precios actuales** (restaurantes leídos en los últimos
  30 días); los precios dudosos se marcan con ⚠ y no entran en los cálculos.

## Desarrollo en local

1. **Base de datos**
   - Crea únicamente la base de datos vacía (`CREATE DATABASE comparador_de_precios;`).
   - Importa los 4 archivos `.sql` de `database/` **en este orden**: `restaurante`, `productos`, `precio`, `historico`. Cada uno crea su tabla y carga los datos — no hace falta (ni conviene) crear las tablas a mano antes.
   - Si tu base de datos es anterior a la columna `categoria`, ejecuta una vez `database/migracion_categoria.sql`.
2. **Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env   # y ajusta tus credenciales si no usas root/root
   npm start
   ```
3. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. **Scraper** (opcional, solo si quieres refrescar los precios)
   ```bash
   python -m venv venv
   venv\Scripts\activate        # en Windows
   pip install -r requirements.txt
   cp .env.example .env         # ajusta tus credenciales
   python scraper.py
   python db_loader.py
   ```

### Opciones del scraper

Se configuran con variables de entorno (o en el `.env`):

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `NAVEGADOR` | `chrome` | `edge` para usar Microsoft Edge (Windows sin Chrome) |
| `HEADLESS` | `false` | `true` para no abrir ventanas (GitHub Actions) |
| `HILOS` | `1` | Restaurantes que se leen a la vez |
| `PAUSA_SEGUNDOS` | `60` | Pausa entre un restaurante y el siguiente |
| `LIMITE_RESTAURANTES` | todos | Leer solo los primeros N (pruebas) |
| `GUARDAR_HTML` | – | Carpeta donde guardar el HTML de cada página (análisis) |

El scraper lee los datos estructurados que Uber Eats incluye en la página
(`__REACT_QUERY_STATE__`): un registro por artículo (aunque aparezca en varias
secciones), su precio y su sección, que se guarda como categoría. Si dos
artículos distintos se llaman igual, añade la sección al nombre, p. ej.
"Hamburguesa (Menú infantil)". Descarta restaurantes que no estén en Madrid.

Si Uber Eats muestra su página de verificación, el scraper **se detiene en ese
momento** y no visita más restaurantes. No intenta saltarse la verificación.

### Lista de restaurantes

`lista_restaurantes.json` se genera con `descubrir_restaurantes.py`, que visita
los McDonald's candidatos (sacados del sitemap público de Uber Eats) y se queda
con los que tienen dirección en Madrid capital. Solo hace falta ejecutarlo para
actualizar la lista.

## Despliegue en producción

La aplicación está pensada para desplegarse en tres partes independientes:

| Parte | Dónde | Notas |
|---|---|---|
| Base de datos MySQL | Railway (u otro hosting con MySQL) | Copia las credenciales que te dé el hosting |
| Backend (Express) | Render o Railway | Variables de entorno: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| Frontend (React/Vite) | Vercel o Netlify | Variable de entorno: `VITE_API_URL` con la URL pública del backend |
| Scraper | En local o GitHub Actions (manual) | Ver `.github/workflows/scraper.yml` |

### Pasos

1. **MySQL en Railway**: crea un proyecto → *New → Database → MySQL*. En la
   pestaña *Variables* verás `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`,
   `MYSQLPASSWORD` y `MYSQLDATABASE` (conexión interna), y en *Settings →
   Networking* el **TCP Proxy público** (host `xxx.proxy.rlwy.net` y un puerto
   distinto de 3306), que es el que se usa desde fuera de Railway.
2. **Importar los datos**: con el host/puerto públicos, importa los 4 `.sql` en
   orden (`restaurante`, `productos`, `precio`, `historico`) con MySQL Workbench
   o con `mysql --default-character-set=utf8mb4 -h HOST -P PUERTO -u root -p railway < archivo.sql`.
   En Windows **no** uses `Get-Content archivo.sql | mysql ...` en PowerShell:
   estropea los acentos y el símbolo ®.
3. **Backend en Railway**: *New → GitHub Repo*, con *Root Directory* `backend`.
   Variables: `DB_HOST=${{MySQL.MYSQLHOST}}`, `DB_PORT=${{MySQL.MYSQLPORT}}`,
   `DB_USER=${{MySQL.MYSQLUSER}}`, `DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}`,
   `DB_NAME=${{MySQL.MYSQLDATABASE}}`. En *Settings → Networking* pulsa
   *Generate Domain* para obtener la URL pública. (Si usas Render, pon ahí el
   host y puerto **públicos** del paso 1.)
4. **Frontend en Vercel**: importa el repo, *Root Directory* `frontend`,
   framework Vite, y variable `VITE_API_URL=https://<url-del-backend>` (sin `/`
   final). Si cambias esta variable, hay que volver a desplegar.
5. **Secrets de GitHub Actions**: los de la sección siguiente, con el host y
   puerto **públicos** del paso 1.

### Scraper con GitHub Actions

El workflow `.github/workflows/scraper.yml` ejecuta el scraper en los servidores
de GitHub y carga los datos. Se lanza **a mano** desde la pestaña **Actions**
("Run workflow"). En la práctica, Uber Eats suele pedir verificación a los
servidores de GitHub, así que lo habitual es ejecutar el scraper **desde un PC**
(`NAVEGADOR=edge python scraper.py` y después `python db_loader.py` con el `.env`
apuntando a la base de datos desplegada).

Para que el workflow pueda escribir en la base de datos, en tu repositorio de
GitHub ve a **Settings → Secrets and variables → Actions → New repository
secret** y añade `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`
con los datos de tu base de datos ya desplegada (no la de local).

## API del backend

| Ruta | Descripción |
|---|---|
| `GET /api/health` | Comprueba que el servidor y la base de datos responden |
| `GET /api/productos` | Productos vigentes (vistos en la última lectura de su restaurante) con su precio actual, categoría y `precio_fiable` |
| `GET /api/historico/:id_producto` | Histórico de precios de un producto; `lectura_ambigua` marca las lecturas no fiables |

## Limitaciones conocidas

- **Verificación de Uber Eats.** Uber Eats puede mostrar una página de
  verificación (CAPTCHA), sobre todo tras muchas visitas seguidas o desde
  servidores (GitHub Actions). El scraper se detiene y no modifica la base de
  datos; los restaurantes no leídos conservan su último precio y su histórico.
  La utilidad real de la herramienta depende de poder hacer lecturas periódicas.
- **Son precios de Uber Eats (delivery)**, que pueden no coincidir con los del
  restaurante.
- **Datos del scraper antiguo (2025).** El scraper original leía los textos de la
  página y mezclaba artículos distintos con el mismo nombre (suelto, en oferta…).
  Esas lecturas se detectan (precios distintos del mismo producto con menos de
  60 s de diferencia), se marcan con ⚠ y no se usan en gráficas ni cálculos.
- **Histórico depurado.** Hasta la corrección de `db_loader.py` cada ejecución
  guardaba una fila de histórico aunque el precio no cambiara. Se eliminaron esas
  filas repetidas (de 16.876 a 4.188); el histórico solo contiene cambios reales.

## Variables de entorno

Cada parte del proyecto tiene su propio `.env.example` como plantilla:
`/.env.example` (scraper), `backend/.env.example` y `frontend/.env.example`.
Ninguno de los `.env` reales debe subirse al repositorio (ya están en `.gitignore`).
