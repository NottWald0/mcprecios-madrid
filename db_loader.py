import json  
import os
import pymysql
from datetime import datetime
from decimal import Decimal

# Si existe un archivo .env en local, cargo las variables desde ahí.
# En GitHub Actions (o en el hosting) estas variables se definen como
# secretos/variables de entorno, así que este import es opcional.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Configuro la conexión a MySQL a partir de variables de entorno.
# Si no se definen, uso los valores de desarrollo local por defecto.
conexion = pymysql.connect(
    host=os.environ.get("DB_HOST", "localhost"),
    port=int(os.environ.get("DB_PORT") or 3306),
    user=os.environ.get("DB_USER", "root"),
    password=os.environ.get("DB_PASSWORD", "root"),
    database=os.environ.get("DB_NAME", "comparador_de_precios")
)
cursor = conexion.cursor()  # Creo un cursor para ejecutar consultas SQL


with open("datos_extraidos.json", "r", encoding="utf-8") as archivo:
    informacion = json.load(archivo)  # Primero leo el JSON y lo guardo en una variable

# -------------------Recorro cada restaurante del JSON para procesarlo-------------------------------------
for restaurante in informacion["restaurantes"]:
    # Compruebo si el restaurante ya esta en la base de datos
    cursor.execute("SELECT id_restaurante FROM restaurante WHERE nombre = %s", (restaurante["nombre"],))
    resultado = cursor.fetchone()  

    # Si el restaurante ya existe, uso su ID; si no, lo inserto y uso su nuevo ID
    if resultado:
        id_restaurante = resultado[0]  # El ID del restaurante ya existente
    else:
        cursor.execute("INSERT INTO restaurante (nombre) VALUES (%s)", (restaurante["nombre"],))  # Inserto el restaurante
        id_restaurante = cursor.lastrowid  # Obtengo el ID del restaurante  


    # ------------------------Ahora proceso los productos del restaurante---------------------------------------
    for producto in restaurante["productos"]:
        # Compruebo si el producto ya está en la base de datos para el restaurante
        cursor.execute("SELECT id_producto FROM productos WHERE nombre = %s AND id_restaurante = %s",
                       (producto["nombre"], id_restaurante))
        resultado = cursor.fetchone()

        # Categoría = sección de la carta de Uber Eats (el scraper antiguo no la guardaba)
        categoria = producto.get("seccion")

        if resultado:
            id_producto = resultado[0]
            if categoria:
                cursor.execute("UPDATE productos SET categoria = %s WHERE id_producto = %s", (categoria, id_producto))
        else:
            cursor.execute("INSERT INTO productos (nombre, id_restaurante, categoria) VALUES (%s, %s, %s)",
                           (producto["nombre"], id_restaurante, categoria))
            id_producto = cursor.lastrowid

        # ----------------A continuacion convierto la fecha del JSON a un formato que MySQL entienda-----------------
        fecha = datetime.strptime(producto["fecha"], "%Y-%m-%d %H:%M:%S")

        #--------------------- Finalmente compruebo si el producto ya tiene un precio registrado-----------------------------------
        cursor.execute("SELECT id_precio, precio, fecha FROM precio WHERE id_producto = %s", (id_producto,))
        precio_actual = cursor.fetchone()  # Obtengo el precio actual, si existe

        # Si el producto ya tiene un precio registrado
        if precio_actual:
            # Comparo el precio actual con el nuevo precio del JSON
            # MySQL devuelve Decimal('3.80') y el JSON trae el float 3.8: sin convertir, nunca son iguales
            if precio_actual[1] != Decimal(str(producto["precio"])):  # Si el precio cambio guardo el precio anterior en la tabla Historico
                cursor.execute("INSERT INTO historico (id_producto, precio, fecha) VALUES (%s, %s, %s)",
                               (id_producto, precio_actual[1], precio_actual[2]))
                # y actualizo el precio actual en la tabla Precio con el nuevo precio y fecha
                cursor.execute("UPDATE precio SET precio = %s, fecha = %s WHERE id_producto = %s",
                               (producto["precio"], fecha, id_producto))
            else:
                # Si el precio no cambia, actualizo solo la fecha: así "fecha" indica la última vez que se vio
                # el producto en la carta y la web puede distinguir los productos que siguen a la venta
                cursor.execute("UPDATE precio SET fecha = %s WHERE id_producto = %s", (fecha, id_producto))
        else:
            # Si el producto no tiene precio, inserto un nuevo precio en la tabla Precio
            cursor.execute("INSERT INTO precio (id_producto, precio, fecha) VALUES (%s, %s, %s)",
                           (id_producto, producto["precio"], fecha))

# Guardo todos los cambios en la base de datos
conexion.commit()
# Cierro la conexión a la base de datos para liberar recursos
conexion.close()


print("Datos cargados en la base de datos correctamente.")