# Comparador de precios · McDonald's Madrid

Web para que los **gerentes de restaurantes McDonald's de Madrid** vean cómo
están sus precios frente a los demás restaurantes de la ciudad, sin tener que
buscarlos a mano en Uber Eats.

**Web publicada:** https://mcprecios-madrid.vercel.app

## ¿Qué se puede hacer en la web?

- **Elegir tu restaurante** y ver, producto a producto, si tu precio está
  **por encima, en la media o por debajo** del resto de Madrid, y en qué
  posición estás (por ejemplo, "4º más barato de 13").
- Ver **todos los restaurantes a la vez** en una tabla.
- Filtrar por **categoría** (McMenú®, Bebidas, Postres…) o **buscar** un producto.
- Pulsar un producto para **compararlo entre restaurantes**, o un precio para
  ver **cómo ha cambiado con el tiempo**.
- **Exportar a Excel** lo que estás viendo.

> Los precios son los de **Uber Eats (a domicilio)** y pueden no coincidir con
> los del restaurante. Los marcados con ⚠ no son fiables.

## ¿Cómo funciona?

```
Uber Eats  →  scraper.py  →  datos_extraidos.json  →  db_loader.py  →  MySQL  →  backend  →  web
             (lee precios)                            (los guarda)             (API)     (React)
```

1. El **scraper** abre la página de cada restaurante en Uber Eats y lee sus productos y precios.
2. El **cargador** (`db_loader.py`) los guarda en la base de datos. Si un precio cambia, el anterior pasa al histórico.
3. El **backend** ofrece esos datos a la web.
4. La **web** los muestra y hace las comparaciones.

## ¿Qué hay en cada carpeta?

| Carpeta / archivo | Qué es |
|---|---|
| `frontend/` | La web (React) |
| `backend/` | La API (Node.js + Express) |
| `database/` | Copia de la base de datos (4 archivos `.sql`) |
| `scraper.py` | Lee los precios de Uber Eats |
| `db_loader.py` | Guarda los precios leídos en la base de datos |
| `lista_restaurantes.json` | Los restaurantes que lee el scraper |
| `descubrir_restaurantes.py` | Busca McDonald's de Madrid en Uber Eats y crea la lista anterior |

## Arrancarlo en tu ordenador

Necesitas **Node.js**, **Python** y **MySQL** (por ejemplo, en Docker).

**1. Base de datos**

Crea una base de datos vacía llamada `comparador_de_precios` e importa los
archivos de `database/` **en este orden**: `restaurante`, `productos`, `precio`
e `historico`.

> En Windows, no importes los `.sql` con `Get-Content archivo.sql | mysql` en
> PowerShell: estropea las tildes y el símbolo ®.

**2. Backend** (queda en http://localhost:5000)

```bash
cd backend
npm install
cp .env.example .env
npm start
```

**3. Web** (queda en http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

## Actualizar los precios

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python scraper.py
python db_loader.py
```

- En el `.env` pon los datos de la base de datos donde quieras guardar los precios.
- Si no tienes Chrome, añade `NAVEGADOR=edge` al `.env`.
- El scraper lee los restaurantes **de uno en uno, con 1 minuto de pausa**, para no sobrecargar Uber Eats.
- Si Uber Eats pide una verificación ("No soy un robot"), el scraper **se para solo** y avisa de qué restaurantes no ha podido leer. **No hay que resolverla**: lo mejor es volver a intentarlo otro día.

<details>
<summary>Otras opciones del scraper</summary>

| Variable | Qué hace |
|---|---|
| `HEADLESS=true` | No abre ventanas del navegador |
| `HILOS=2` | Lee varios restaurantes a la vez (por defecto, 1) |
| `PAUSA_SEGUNDOS=60` | Pausa entre restaurantes |
| `LIMITE_RESTAURANTES=1` | Solo lee los primeros N (para pruebas) |
| `GUARDAR_HTML=carpeta` | Guarda las páginas descargadas para revisarlas |

</details>

## Publicación en internet

| Parte | Dónde está |
|---|---|
| Base de datos (MySQL) | Railway |
| Backend | Railway → https://backend-production-946a.up.railway.app |
| Web | Vercel → https://mcprecios-madrid.vercel.app |
| Scraper | En un PC, o a mano desde GitHub Actions (pestaña *Actions*) |

<details>
<summary>Cómo desplegarlo desde cero</summary>

1. **Railway:** crea un proyecto con una base de datos **MySQL** y activa su
   acceso público (*Settings → Networking → TCP Proxy*). Importa los 4 `.sql`.
2. **Backend en Railway:** servicio nuevo con la carpeta `backend` y estas
   variables: `DB_HOST=${{MySQL.MYSQLHOST}}`, `DB_PORT=${{MySQL.MYSQLPORT}}`,
   `DB_USER=${{MySQL.MYSQLUSER}}`, `DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}`,
   `DB_NAME=${{MySQL.MYSQLDATABASE}}`. Genera un dominio público.
3. **Web en Vercel:** importa el repositorio con la carpeta `frontend` y la
   variable `VITE_API_URL` con la dirección del backend (sin `/` al final).
4. **GitHub Actions (opcional):** en *Settings → Secrets and variables →
   Actions* añade `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`
   con los datos **públicos** de la base de datos de Railway.

Si tu base de datos es anterior a las categorías, ejecuta una vez
`database/migracion_categoria.sql`.

</details>

## API del backend

| Dirección | Qué devuelve |
|---|---|
| `/api/health` | Si el servidor y la base de datos funcionan |
| `/api/productos` | Los precios actuales de todos los productos |
| `/api/historico/:id` | El historial de precios de un producto |

## Limitaciones

- **Uber Eats puede bloquear el scraper** con una verificación, sobre todo si se
  hacen muchas visitas seguidas o desde servidores como GitHub. Por eso los
  precios solo se actualizan cuando el scraper consigue leerlos.
- **Datos de 2025:** el primer scraper confundía productos con el mismo nombre
  (por ejemplo, el mismo menú suelto y en oferta). Esos precios se marcan con ⚠
  y no se usan en los cálculos ni en los gráficos.
- **Solo se muestran precios actuales:** los restaurantes que no se han podido
  leer en el último mes no aparecen en la tabla, aunque su historial se conserva.
