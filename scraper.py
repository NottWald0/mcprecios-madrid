from selenium import webdriver                          
from selenium.webdriver.chrome.service import Service   
from selenium.webdriver.chrome.options import Options   
from selenium.webdriver.common.by import By             
import json                                              
import os
import sys
import time                                            
import threading                                         
from queue import Queue                                  

# Cargo la lista de restaurantes desde un archivo JSON externo
with open('lista_restaurantes.json', 'r', encoding='utf-8') as f:
    lista_restaurantes = json.load(f)

# Ruta al chromedriver: solo hace falta si quieres forzar una versión concreta.
# Si no se define la variable de entorno CHROMEDRIVER_PATH, Selenium (4.6+) usa
# su Selenium Manager integrado para descargar el driver correcto automáticamente,
# tanto en tu PC como en GitHub Actions.
CHROMEDRIVER_PATH = os.environ.get("CHROMEDRIVER_PATH")

# HEADLESS=true en GitHub Actions (no hay pantalla); en tu PC lo puedes dejar
# visible (HEADLESS=false o sin definir) para ver el navegador mientras haces pruebas.
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"

# Función que extrae productos y precios de un restaurante
def scrape_restaurant(restaurante, resultados, lock):
    print(f"Extrayendo datos de {restaurante['nombre']} en hilo {threading.current_thread().name}...")

    # Configura el navegador Chrome
    opciones = Options()
    if HEADLESS:
        opciones.add_argument("--headless=new")
        opciones.add_argument("--no-sandbox")
        opciones.add_argument("--disable-dev-shm-usage")
        opciones.add_argument("--window-size=1920,1080")

    servicio = Service(executable_path=CHROMEDRIVER_PATH) if CHROMEDRIVER_PATH else Service()
    navegador = webdriver.Chrome(service=servicio, options=opciones)

    # Abre la página del restaurante
    navegador.get(restaurante["enlace"])
    time.sleep(10)  # Espera a que la página cargue para simular el comportamiento de un humano

    # Diccionario donde se guardarán los datos del restaurante
    datos = {
        "nombre": restaurante["nombre"],
        "plataforma": restaurante.get("plataforma", "Uber Eats"),
        "direccion": restaurante.get("direccion", ""),
        "productos": []  # Lista donde se guardarán los productos con precios
    }

    try:
        # Busca todos los elementos tipo <li> que podrían contener productos
        items = navegador.find_elements(By.TAG_NAME, "li")

        for item in items:
            nombre = None
            precio = None

            # Busco los spans que contengan texto dentro de la lista
            spans = item.find_elements(By.CSS_SELECTOR, "span[data-testid='rich-text']")

            for span in spans:
                text = span.text.strip()
                # Si contiene el simbolo '€', lo intento convertir a número
                if '€' in text:
                    try:
                        precio = float(text.replace('€','').replace(',','.').strip())
                    except:
                        precio = None
                # Si no es precio lo guardo como nombre
                elif text and not precio:
                    nombre = text

            # Cuando tengo precio y nombre los gyuardo en la lista
            if nombre and precio is not None:
                datos['productos'].append({
                    'nombre': nombre,
                    'precio': precio,
                    'fecha': time.strftime("%Y-%m-%d %H:%M:%S") 
                })

    except Exception as e:
        print(f"Error procesando productos en {restaurante['nombre']}: {e}")

    finally:
        # Si no he encontrado productos, muestro qué página ha cargado para saber el motivo
        # (por ejemplo, desde 2026 Uber Eats puede mostrar un CAPTCHA en lugar de la carta)
        if datos['productos']:
            print(f"{restaurante['nombre']}: {len(datos['productos'])} productos")
        else:
            print(f"AVISO: 0 productos en {restaurante['nombre']}. Página cargada: '{navegador.title}' ({navegador.current_url[:80]})")
        navegador.quit()

    # Uso un lock para evitar problemas al modificar la lista compartida entre los hilos
    # Cuando un restaurante hilo este añadiendo info a la lista, los demas no pueden modificarla
    with lock:
        resultados.append(datos)

# Función que ejecuta la cola de restaurantes en hilos 
def worker(queue, resultados, lock):
    while True:
        restaurante = queue.get() # Cada vez que se llama a la cole, se recibe un restaurante para procesarlo y obtener la info
        if restaurante is None:
            queue.put(None) 
            break
        scrape_restaurant(restaurante, resultados, lock) #Si la funcion
        queue.task_done()  # Marca la tarea como terminada

# Punto de entrada del script
if __name__ == '__main__':
    resultados = []              
    lock = threading.Lock()      
    queue = Queue()              
    NUM_THREADS = 3              

    # Carga todos los restaurantes en la cola
    for r in lista_restaurantes:
        queue.put(r)
    queue.put(None)  

    # Crea y lanza los hilos
    threads = []
    for i in range(NUM_THREADS):
        t = threading.Thread(target=worker, args=(queue, resultados, lock), name=f"Hilo-{i+1}")
        t.start()
        threads.append(t)

    # Espera a que todos los hilos terminen
    for t in threads:
        t.join()

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

    print(f"Extracción completada: {total_productos} productos. Datos guardados en datos_extraidos.json")
