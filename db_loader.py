import json
import os
import re
import time
import unicodedata
from datetime import datetime
from decimal import Decimal

import pymysql

# Si existe un archivo .env en local, cargo las variables desde ahí.
# En GitHub Actions (o en el hosting) estas variables se definen como
# secretos/variables de entorno, así que este import es opcional.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def conectar():
    # Configuro la conexión a MySQL a partir de variables de entorno.
    # Si no se definen, uso los valores de desarrollo local por defecto.
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT") or 3306),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", "root"),
        database=os.environ.get("DB_NAME", "comparador_de_precios"),
        # DB_SSL=true para bases de datos en la nube que exigen conexión cifrada (p. ej. TiDB Cloud)
        ssl_verify_cert=os.environ.get("DB_SSL") == "true" or None,
        ssl_verify_identity=os.environ.get("DB_SSL") == "true" or None
    )


def clave_nombre(nombre):
    # Aproximación en Python a cómo compara nombres la base de datos (sin distinguir mayúsculas ni tildes).
    # Solo se usa para productos nuevos repetidos dentro del mismo archivo; los que ya existen
    # se buscan con la propia base de datos.
    sin_tildes = unicodedata.normalize("NFD", nombre)
    sin_tildes = "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sin_tildes).strip().casefold()


def buscar_productos(cursor, id_restaurante, nombres):
    """Devuelve {nombre del JSON: id_producto} para los nombres que ya existen en el restaurante.

    La comparación la hace la base de datos (igual que el cargador original, que buscaba producto a
    producto con WHERE nombre = %s), pero con una sola consulta para todos los nombres.
    """
    if not nombres:
        return {}
    filas = " UNION ALL ".join(["SELECT %s AS idx, %s AS nombre"] * len(nombres))
    parametros = [v for i, n in enumerate(nombres) for v in (i, n)]
    cursor.execute(f"""
        SELECT j.idx, MIN(p.id_producto)
        FROM ({filas}) j
        JOIN productos p ON p.nombre = j.nombre COLLATE utf8mb4_0900_ai_ci AND p.id_restaurante = %s
        GROUP BY j.idx
    """, parametros + [id_restaurante])
    return {nombres[idx]: id_producto for idx, id_producto in cursor.fetchall()}


def cargar_restaurante(cursor, id_restaurante, productos):
    """Carga los productos de un restaurante con unas pocas consultas en bloque.

    El resultado es el mismo que procesar los productos uno a uno: si un precio cambia, el anterior
    pasa al histórico; si no cambia, solo se actualiza la fecha (última vez que se vio).
    """
    nombres = list(dict.fromkeys(p["nombre"] for p in productos))
    existentes = buscar_productos(cursor, id_restaurante, nombres)

    # Precio y fecha actuales de los productos que ya existen
    estado = {}
    ids = list(set(existentes.values()))
    if ids:
        marcas = ",".join(["%s"] * len(ids))
        cursor.execute(f"SELECT id_producto, precio, fecha FROM precio WHERE id_producto IN ({marcas})", ids)
        estado = {id_producto: (precio, fecha) for id_producto, precio, fecha in cursor.fetchall()}

    # 1) Productos nuevos: los inserto todos de una vez (un mismo producto nuevo repetido en el
    #    archivo se inserta una sola vez, como hacía el cargador original)
    nuevos = {}
    for p in productos:
        if p["nombre"] not in existentes:
            nuevos.setdefault(clave_nombre(p["nombre"]), p)
    if nuevos:
        cursor.executemany(
            "INSERT INTO productos (nombre, id_restaurante, categoria) VALUES (%s, %s, %s)",
            [(p["nombre"], id_restaurante, p.get("seccion")) for p in nuevos.values()]
        )
        insertados = buscar_productos(cursor, id_restaurante, [p["nombre"] for p in nuevos.values()])
        for p in productos:
            if p["nombre"] not in existentes:
                existentes[p["nombre"]] = insertados[nuevos[clave_nombre(p["nombre"])]["nombre"]]

    # 2) Recorro los productos en orden, en memoria, decidiendo qué hay que guardar
    historico, categorias = [], {}
    for p in productos:
        id_producto = existentes[p["nombre"]]
        fecha = datetime.strptime(p["fecha"], "%Y-%m-%d %H:%M:%S")
        # MySQL devuelve Decimal('3.80') y el JSON trae el float 3.8: sin convertir, nunca son iguales
        precio = Decimal(str(p["precio"]))
        if p.get("seccion"):
            categorias[id_producto] = p["seccion"]

        if id_producto in estado:
            precio_anterior, fecha_anterior = estado[id_producto]
            if precio_anterior != precio:
                # El precio ha cambiado: el anterior pasa al histórico
                historico.append((id_producto, precio_anterior, fecha_anterior))
                estado[id_producto] = (precio, fecha)
            else:
                # Mismo precio: solo actualizo la fecha de la última lectura
                estado[id_producto] = (precio_anterior, fecha)
        else:
            estado[id_producto] = (precio, fecha)

    # 3) Guardo todo en bloque
    if historico:
        cursor.executemany("INSERT INTO historico (id_producto, precio, fecha) VALUES (%s, %s, %s)", historico)

    tocados = {existentes[p["nombre"]] for p in productos}
    cursor.executemany(
        "INSERT INTO precio (id_producto, precio, fecha) VALUES (%s, %s, %s) "
        "ON DUPLICATE KEY UPDATE precio = VALUES(precio), fecha = VALUES(fecha)",
        [(i, estado[i][0], estado[i][1]) for i in tocados]
    )

    if categorias:
        # Actualizo la categoría con un único UPDATE ... CASE
        casos = " ".join(["WHEN %s THEN %s"] * len(categorias))
        marcas = ",".join(["%s"] * len(categorias))
        parametros = [v for par in categorias.items() for v in par] + list(categorias)
        cursor.execute(f"UPDATE productos SET categoria = CASE id_producto {casos} END WHERE id_producto IN ({marcas})",
                       parametros)

    return len(nuevos), len(historico)


if __name__ == "__main__":
    inicio = time.time()
    conexion = conectar()
    cursor = conexion.cursor()  # Creo un cursor para ejecutar consultas SQL

    with open("datos_extraidos.json", "r", encoding="utf-8") as archivo:
        informacion = json.load(archivo)  # Primero leo el JSON y lo guardo en una variable

    total_nuevos = total_cambios = total_productos = 0
    # -------------------Recorro cada restaurante del JSON para procesarlo-------------------------------------
    for restaurante in informacion["restaurantes"]:
        # Compruebo si el restaurante ya esta en la base de datos; si no, lo inserto
        cursor.execute("SELECT id_restaurante FROM restaurante WHERE nombre = %s", (restaurante["nombre"],))
        resultado = cursor.fetchone()
        if resultado:
            id_restaurante = resultado[0]
        else:
            cursor.execute("INSERT INTO restaurante (nombre) VALUES (%s)", (restaurante["nombre"],))
            id_restaurante = cursor.lastrowid

        nuevos, cambios = cargar_restaurante(cursor, id_restaurante, restaurante["productos"])
        total_nuevos += nuevos
        total_cambios += cambios
        total_productos += len(restaurante["productos"])
        print(f"{restaurante['nombre']}: {len(restaurante['productos'])} productos, {nuevos} nuevos, {cambios} cambios de precio")

    # Guardo todos los cambios en la base de datos de una vez (si algo falla antes, no se guarda nada)
    conexion.commit()
    # Cierro la conexión a la base de datos para liberar recursos
    conexion.close()

    print(f"Datos cargados en la base de datos correctamente: {len(informacion['restaurantes'])} restaurantes, "
          f"{total_productos} productos, {total_nuevos} nuevos, {total_cambios} cambios de precio "
          f"({time.time() - inicio:.1f} s).")
