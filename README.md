# ComparadorDePrecios

Aplicación que compara precios de productos de McDonald's en Uber Eats en varios
restaurantes de Madrid, guarda un histórico de precios y lo muestra en una web.

- **Scraping**: Python + Selenium
- **Backend**: Node.js + Express + MySQL
- **Frontend**: React + Vite + Recharts

## Desarrollo en local

1. **Base de datos**
   - Crea únicamente la base de datos vacía (`CREATE DATABASE comparador_de_precios;`).
   - Importa los 4 archivos `.sql` de `database/` **en este orden**: `restaurante`, `productos`, `precio`, `historico`. Cada uno crea su tabla y carga los datos — no hace falta (ni conviene) crear las tablas a mano antes.
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

## Despliegue en producción

La aplicación está pensada para desplegarse en tres partes independientes:

| Parte | Dónde | Notas |
|---|---|---|
| Base de datos MySQL | Railway (u otro hosting con MySQL) | Copia las credenciales que te dé el hosting |
| Backend (Express) | Render o Railway | Variables de entorno: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| Frontend (React/Vite) | Vercel o Netlify | Variable de entorno: `VITE_API_URL` con la URL pública del backend |
| Scraper | GitHub Actions (manual) | Ver `.github/workflows/scraper.yml` |

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

El scraper se ejecuta en los servidores de GitHub (gratis, sin depender de tu
ordenador), definido en `.github/workflows/scraper.yml`. Se lanza **a mano**
desde la pestaña **Actions** del repositorio, con el botón "Run workflow". La
ejecución diaria automática está desactivada por el CAPTCHA de Uber Eats (ver
*Limitaciones conocidas*); el propio workflow explica cómo volver a programarla.

Para que pueda escribir en la base de datos, en tu repositorio de GitHub ve a
**Settings → Secrets and variables → Actions → New repository secret** y añade:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

con los datos de tu base de datos ya desplegada (no la de local).

## API del backend

| Ruta | Descripción |
|---|---|
| `GET /api/health` | Comprueba que el servidor y la base de datos responden |
| `GET /api/productos` | Productos con su precio actual; `precio_fiable` indica si el precio es fiable |
| `GET /api/historico/:id_producto` | Histórico de precios de un producto (el id debe ser un entero positivo) |

## Limitaciones conocidas

- **CAPTCHA de Uber Eats (desde 2026).** Uber Eats muestra un reCAPTCHA antes de la
  carta, así que el scraper ya no obtiene productos. En ese caso termina con error
  (la ejecución de GitHub Actions sale en rojo) y no modifica la base de datos. Los
  datos disponibles son los recogidos entre mayo y junio de 2025.
- **Productos con el mismo nombre.** En Uber Eats algunos artículos aparecen varias
  veces con el mismo nombre y distinto precio (suelto, en oferta…). El scraper solo
  guardaba el nombre, así que esos precios se mezclaban. El backend los detecta
  (cambios de precio dentro de una misma pasada del scraper) y la web los marca con ⚠.
- **Histórico depurado.** Hasta la corrección de `db_loader.py` cada ejecución
  guardaba una fila de histórico aunque el precio no cambiara. Se eliminaron esas
  filas repetidas (de 16.876 a 4.188); el histórico solo contiene cambios reales.

## Variables de entorno

Cada parte del proyecto tiene su propio `.env.example` como plantilla:
`/.env.example` (scraper), `backend/.env.example` y `frontend/.env.example`.
Ninguno de los `.env` reales debe subirse al repositorio (ya están en `.gitignore`).
