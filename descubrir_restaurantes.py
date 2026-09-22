"""Genera lista_restaurantes.json con los McDonald's de Madrid que hay en Uber Eats.

Se ejecuta una sola vez (o cuando quieras actualizar la lista): visita cada
restaurante candidato, lee la dirección que da Uber Eats y se queda solo con los
que están en Madrid capital. Los candidatos salen del sitemap público de Uber Eats
(https://www.ubereats.com/robots.txt -> sitemap-store-*.xml.gz), filtrando los
McDonald's de España cuyo nombre corresponde a zonas de Madrid, más los que ya
estaban en la lista original del proyecto.

Uso:  NAVEGADOR=edge python descubrir_restaurantes.py
"""
import json
import threading
from queue import Queue

import scraper

CANDIDATOS = [
    # Lista original del proyecto (conservan su nombre para no romper el histórico)
    ("McDonald's Carabanchel", "https://www.ubereats.com/es/store/mcdonalds-carabanchel/lGfE3RJeSEGrw2Vi2Cxa4Q"),
    ("McDonald's Plaza Castilla", "https://www.ubereats.com/es/store/mcdonalds-plaza-castilla/9WdL8YvJRo2HHbk-GhxKGA"),
    ("McDonald's Gran Vía", "https://www.ubereats.com/es/store/mcdonalds-gran-via/sSnQZHiSQHKtKDW4tznf5Q"),
    ("McDonald's La Paz", "https://www.ubereats.com/es/store/mcdonalds-la-paz/I2RHAAdRQgKubk50I5xZ5w"),
    ("McDonald's Ventisquero de la Condesa", "https://www.ubereats.com/es/store/mcdonalds-ventisquero-de-la-condesa/kM3l1cnyRw6WIENL270teQ"),
    ("McDonald's Montera", "https://www.ubereats.com/es/store/mcdonalds-montera/Wj22ufhhSHOzvFpLVsb_HA"),
    ("McDonald's Goya", "https://www.ubereats.com/es/store/mcdonalds-goya/MEDEMv39QYmvpCCUgYjpBg"),
    ("McDonald's La Gavia", "https://www.ubereats.com/es/store/mcdonalds-la-gavia/tdEv_CyUQweP8Sx6hRbThA"),
    ("McDonald's Atocha", "https://www.ubereats.com/es/store/mcdonalds-atocha/JTpFmDbKSti7q8iD6AlqbQ"),
    ("McDonald's Vallecas Villa", "https://www.ubereats.com/es/store/mcdonalds-vallecas-villa/GFoBbofnSSmXHizBQ0QIpA"),
    # Candidatos del sitemap (el nombre definitivo lo da Uber Eats)
    (None, "https://www.ubereats.com/es/store/mcdonalds-cabrera/-SUUlfsZQsGBfQ3dAXB0JA"),
    (None, "https://www.ubereats.com/es/store/mcdonald-s-colombia/OHVNKcuJU5Sg0J_ve-9QZg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-san-ignacio/jU8yMBRYRsiDP7emhRs7bA"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-villaverde/F0tuozQGTWS-fSkM52MV6A"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-san-isidro/8ap1uCz5RC-GTNEtvzLg8w"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-madrid-jarama/3I1jWBM8R5altXus-pYd3g"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-la-granja/GuHYpclCXg--KF-lioKs0g"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-manoteras/5GsjooJ3VHyuaRYcB1BtMA"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-vaguada/h_dDt4MFSY2qjNPQVg5DYg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-kinepolis/x67ZxdJVSWWuTD_4G165UA"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-jumbo/DDVncUsUR7qZO7m7T_RiKg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-m-cadena/X1FMzhqtRkO2VUGBhUgSRg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-principe-pio/CajWDs2oR0iZ3pfaa49hyg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-carrefour/basSvIyHRRGI_kDeQiDrBA"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-mitre/3TikIGzcXc2wLup_D7IqNQ"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-tablas-shell/oll9Q_AyT2iiejB6rnnogg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-las-tablas-repsol/FF6O8SGCQZC4t6fWt5wtkQ"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-el-muelle/NFsY9BC_SPC9DajoMHRgzg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-heron-city-off/o9HWDWrIRFSrUQUluIXHkQ"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-beata/NNoj9HU9WYG0WRXEHy0Pog"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-metropolitano-estadio/mtNRGrK9Xk2gtGwfTz2QFA"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-fuencarral/XqsjqQY4TOazCpeVNRU6Ew"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-hortaleza/o_x_tYiaRCOlSm3BWwVfWw"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-vicalvaro/xMo369KIXT2M7Q05mRQs4Q"),
    (None, "https://www.ubereats.com/es/store/mcdonalds/qD-Js1iRSb6wkED217hk8w"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-pozas/zxiSO0QVXP2-AxmdUK4hOg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-ensanche-sur/60MNGFSURTq9QhL_G8Ugag"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-opera/eytxdIx_RyS7mZNG-GAyMg"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-palacio-de-hielo/ncdsHkkXSHyVSS8XdgUJ_Q"),
    (None, "https://www.ubereats.com/es/store/mcdonalds-san-blas/UfWH4cgeTAeWQsqPGsz9KQ"),
]


def comprobar(candidatos, encontrados, lock):
    while True:
        tarea = candidatos.get()
        if tarea is None:
            candidatos.put(None)
            break
        orden, nombre, enlace = tarea
        try:
            tienda, titulo = scraper.descargar_tienda({"nombre": nombre or enlace.split("/")[-2], "enlace": enlace})
        except Exception as e:
            print(f"ERROR   {enlace}: {e}")
            continue
        if not tienda:
            print(f"SIN DATOS {enlace} (página: '{titulo}')")
            continue
        ubicacion = tienda.get("location", {})
        nombre = nombre or scraper.nombre_restaurante(tienda)
        if not scraper.es_de_la_ciudad(tienda):
            print(f"FUERA   {nombre}: {ubicacion.get('address')}")
            continue
        print(f"MADRID  {nombre}: {ubicacion.get('address')}")
        with lock:
            encontrados.append((orden, {
                "enlace": enlace,
                "nombre": nombre,
                "direccion": ubicacion.get("streetAddress", ""),
                "codigo_postal": ubicacion.get("postalCode", "")
            }))


if __name__ == "__main__":
    cola = Queue()
    for orden, (nombre, enlace) in enumerate(CANDIDATOS):
        cola.put((orden, nombre, enlace))
    cola.put(None)

    encontrados, lock = [], threading.Lock()
    hilos = [threading.Thread(target=comprobar, args=(cola, encontrados, lock)) for _ in range(3)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    lista = [r for _, r in sorted(encontrados, key=lambda x: x[0])]
    if not lista:
        print("No se ha encontrado ningún restaurante de Madrid; no modifico lista_restaurantes.json")
    else:
        with open("lista_restaurantes.json", "w", encoding="utf-8") as f:
            json.dump(lista, f, ensure_ascii=False, indent=2)
        print(f"\n{len(lista)} restaurantes de Madrid guardados en lista_restaurantes.json")
