from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from collections import Counter
import json
import os
import re
import sys
import time
import threading
from queue import Queue

# Ruta al chromedriver: solo hace falta si quieres forzar una versión concreta.
# Si no se define la variable de entorno CHROMEDRIVER_PATH, Selenium (4.6+) usa
# su Selenium Manager integrado para descargar el driver correcto automáticamente,
# tanto en tu PC como en GitHub Actions.
CHROMEDRIVER_PATH = os.environ.get("CHROMEDRIVER_PATH")

# HEADLESS=true en GitHub Actions (no hay pantalla); en tu PC lo puedes dejar
# visible (HEADLESS=false o sin definir) para ver el navegador mientras haces pruebas.
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"

# NAVEGADOR=edge para usar Microsoft Edge (útil en Windows si no tienes Chrome).
# Por defecto Chrome, que es el que traen los servidores de GitHub Actions.
NAVEGADOR = os.environ.get("NAVEGADOR", "chrome").lower()

# Opciones para pruebas en local:
# LIMITE_RESTAURANTES=1 procesa solo los primeros N restaurantes de la lista.
# GUARDAR_HTML=carpeta guarda el HTML de cada página para poder analizarlo.
LIMITE_RESTAURANTES = int(os.environ.get("LIMITE_RESTAURANTES") or 0)
GUARDAR_HTML = os.environ.get("GUARDAR_HTML")

# Solo me interesan los restaurantes de esta ciudad (según la dirección que da Uber Eats)
CIUDAD = "Madrid"

# Ritmo de visitas: por defecto un restaurante cada vez y 60 s de pausa entre uno y otro,
# para no cargar el servicio de Uber Eats. Si Uber muestra su página de verificación,
# el scraper se detiene en ese momento y no visita más restaurantes.
HILOS = int(os.environ.get("HILOS") or 1)
PAUSA_SEGUNDOS = int(os.environ.get("PAUSA_SEGUNDOS") or 60)
detener = threading.Event()


def crear_navegador():
    if NAVEGADOR == "edge":
        opciones = webdriver.EdgeOptions()
    else:
        opciones = Options()
    if HEADLESS:
        opciones.add_argument("--headless=new")
        opciones.add_argument("--no-sandbox")
        opciones.add_argument("--disable-dev-shm-usage")
        opciones.add_argument("--window-size=1920,1080")

    if NAVEGADOR == "edge":
        return webdriver.Edge(options=opciones)
    servicio = Service(executable_path=CHROMEDRIVER_PATH) if CHROMEDRIVER_PATH else Service()
    return webdriver.Chrome(service=servicio, options=opciones)


def extraer_tienda(html):
    """Devuelve los datos de la tienda que Uber Eats incrusta en la página como JSON.

    La página incluye un <script id="__REACT_QUERY_STATE__"> con la carta completa
    (secciones, productos con su identificador único y su precio) y la dirección.
    Viene escapado dos veces: las comillas como \\u0022 y las barras invertidas como %5C.
    """
    m = re.search(r'<script type="application/json" id="__REACT_QUERY_STATE__">(.*?)</script>', html, re.S)
    if not m:
        return None
    texto = json.loads('"' + m.group(1).strip() + '"').replace('%5C', '\\')
    estado = json.loads(texto)
    for consulta in estado.get("queries", []):
        datos = consulta.get("state", {}).get("data")
        if isinstance(datos, dict) and "catalogSectionsMap" in datos:
            return datos
    return None


def extraer_productos(tienda, fecha):
    """Saca un producto por cada artículo distinto de la carta.

    - Uber repite el mismo artículo en varias secciones ("Artículos destacados",
      "Top Ventas"...), siempre con el mismo identificador (uuid) y el mismo precio,
      así que me quedo con una sola aparición por uuid.
    - Si dos artículos distintos se llaman igual (p. ej. la "Hamburguesa" suelta y la
      del Menú infantil), añado su sección al nombre para poder distinguirlos.
    """
    articulos = {}
    for bloques in tienda.get("catalogSectionsMap", {}).values():
        for bloque in bloques:
            contenido = bloque.get("payload", {}).get("standardItemsPayload", {})
            seccion = contenido.get("title", {}).get("text", "").strip()
            for item in contenido.get("catalogItems", []):
                if item.get("price") is None or not item.get("title"):
                    continue
                articulo = articulos.setdefault(item["uuid"], {
                    # Uber a veces escribe espacios dobles ("4 McNuggets®  de pollo"): los normalizo
                    "titulo": re.sub(r"\s+", " ", item["title"]).strip(),
                    "precio": item["price"] / 100,  # Uber da el precio en céntimos
                    "secciones": []
                })
                articulo["secciones"].append(seccion)

    # Las secciones destacadas van primero en la carta, así que la sección "real"
    # de cada artículo (su categoría) es la última en la que aparece
    return asignar_nombres([
        {"titulo": a["titulo"], "precio": round(a["precio"], 2), "fecha": fecha, "seccion": a["secciones"][-1], "uuid": uuid}
        for uuid, a in articulos.items()
    ])


def asignar_nombres(articulos):
    """Pone a cada artículo un nombre único dentro de su restaurante."""
    articulos_por_titulo = Counter(a["titulo"].lower() for a in articulos)
    productos = []
    for a in articulos:
        repetido = articulos_por_titulo[a["titulo"].lower()] > 1
        productos.append({
            "nombre": f"{a['titulo']} ({a['seccion']})" if repetido else a["titulo"],
            "precio": a["precio"],
            "fecha": a["fecha"],
            "seccion": a["seccion"],
            "uuid": a["uuid"]
        })

    # Por si dos artículos con el mismo nombre estuvieran también en la misma sección
    repetidos = [n for n, c in Counter(p["nombre"] for p in productos).items() if c > 1]
    for nombre in repetidos:
        for i, p in enumerate(sorted((p for p in productos if p["nombre"] == nombre), key=lambda p: p["precio"])):
            if i > 0:
                p["nombre"] = f"{nombre} #{i + 1}"
    return productos


def nombre_restaurante(tienda):
    # Unifico los formatos que usa Uber Eats: "McDonald's (Carabanchel)",
    # "McDonald's - Manoteras", "McDonald´s - Colombia", "McDonald’s Vicálvaro"...
    # -> "McDonald's Carabanchel", "McDonald's Manoteras"...
    nombre = re.sub(r"\s*\((.*)\)\s*$", r" \1", tienda.get("title", ""))
    nombre = nombre.replace("’", "'").replace("´", "'")
    nombre = re.sub(r"^McDonald's\s*-\s*", "McDonald's ", nombre)
    return nombre.strip()


def es_de_la_ciudad(tienda):
    return tienda.get("location", {}).get("city", "").lower() == CIUDAD.lower()


def descargar_tienda(restaurante):
    """Abre la página de un restaurante y devuelve (datos de la tienda, título de la página)."""
    navegador = crear_navegador()
    try:
        navegador.get(restaurante["enlace"])
        time.sleep(10)  # Espera a que la página cargue para simular el comportamiento de un humano
        html = navegador.page_source
        if GUARDAR_HTML:
            os.makedirs(GUARDAR_HTML, exist_ok=True)
            ruta = os.path.join(GUARDAR_HTML, f"{restaurante['nombre']}.html".replace("'", ""))
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(html)
        return extraer_tienda(html), navegador.title
    finally:
        navegador.quit()


# Función que extrae productos y precios de un restaurante
def scrape_restaurant(restaurante, resultados, lock):
    print(f"Extrayendo datos de {restaurante['nombre']} en hilo {threading.current_thread().name}...")

    try:
        tienda, titulo_pagina = descargar_tienda(restaurante)
    except Exception as e:
        print(f"AVISO: error abriendo {restaurante['nombre']}: {e}")
        return

    # Si no encuentro la carta, muestro qué página ha cargado para saber el motivo
    # (por ejemplo, Uber Eats puede mostrar un CAPTCHA en lugar de la carta)
    if not tienda:
        print(f"AVISO: 0 productos en {restaurante['nombre']}. Página cargada: '{titulo_pagina}'")
        print("AVISO: Uber Eats no ha mostrado la carta (posible verificación). Detengo la ejecución.")
        detener.set()
        return
    if not es_de_la_ciudad(tienda):
        print(f"AVISO: {restaurante['nombre']} no está en {CIUDAD} ({tienda.get('location', {}).get('address')}). Lo salto.")
        return

    ubicacion = tienda.get("location", {})
    datos = {
        "nombre": restaurante["nombre"],
        "plataforma": restaurante.get("plataforma", "Uber Eats"),
        "direccion": ubicacion.get("streetAddress") or restaurante.get("direccion", ""),
        "codigo_postal": ubicacion.get("postalCode"),
        "latitud": ubicacion.get("latitude"),
        "longitud": ubicacion.get("longitude"),
        "productos": extraer_productos(tienda, time.strftime("%Y-%m-%d %H:%M:%S"))
    }
    print(f"{restaurante['nombre']}: {len(datos['productos'])} productos")
    if not datos["productos"]:
        # La página carga pero sin carta (restaurante cerrado o dado de baja en Uber Eats)
        return

    # Uso un lock para evitar problemas al modificar la lista compartida entre los hilos
    # Cuando un restaurante hilo este añadiendo info a la lista, los demas no pueden modificarla
    with lock:
        resultados.append(datos)

# Función que ejecuta la cola de restaurantes en hilos
def worker(queue, resultados, lock):
    while not detener.is_set():
        restaurante = queue.get() # Cada vez que se llama a la cole, se recibe un restaurante para procesarlo y obtener la info
        if restaurante is None:
            queue.put(None)
            break
        scrape_restaurant(restaurante, resultados, lock)
        queue.task_done()  # Marca la tarea como terminada
        # Pausa antes del siguiente restaurante (se interrumpe si hay que detenerse)
        if queue.queue and queue.queue[0] is not None:
            detener.wait(PAUSA_SEGUNDOS)

# Punto de entrada del script
if __name__ == '__main__':
    # Cargo la lista de restaurantes desde un archivo JSON externo
    with open('lista_restaurantes.json', 'r', encoding='utf-8') as f:
        lista_restaurantes = json.load(f)

    resultados = []
    lock = threading.Lock()
    queue = Queue()

    # Carga todos los restaurantes en la cola
    a_procesar = lista_restaurantes[:LIMITE_RESTAURANTES or None]
    for r in a_procesar:
        queue.put(r)
    queue.put(None)
    print(f"{len(a_procesar)} restaurantes, {HILOS} a la vez, {PAUSA_SEGUNDOS} s de pausa entre cada uno")

    # Crea y lanza los hilos
    threads = []
    for i in range(HILOS):
        t = threading.Thread(target=worker, args=(queue, resultados, lock), name=f"Hilo-{i+1}")
        t.start()
        threads.append(t)

    # Espera a que todos los hilos terminen
    for t in threads:
        t.join()

    if detener.is_set():
        leidos = {r["nombre"] for r in resultados}
        pendientes = [r["nombre"] for r in a_procesar if r["nombre"] not in leidos]
        print(f"Ejecución detenida por verificación de Uber Eats. Sin leer: {', '.join(pendientes)}")

    # Si no he obtenido ningún producto, termino con error: así GitHub Actions marca la
    # ejecución en rojo, no se lanza db_loader y no sobrescribo el JSON anterior
    total_productos = sum(len(r['productos']) for r in resultados)
    if total_productos == 0:
        print("ERROR: no se ha obtenido ningún producto de ningún restaurante. No se guardan datos.")
        sys.exit(1)

    # Guarda los resultados en un archivo JSON
    datos_final = {"restaurantes": resultados}
    with open('datos_extraidos.json', 'w', encoding='utf-8') as out:
        json.dump(datos_final, out, ensure_ascii=False, indent=4)

    print(f"Extracción completada: {len(resultados)} restaurantes, {total_productos} productos. Datos guardados en datos_extraidos.json")
