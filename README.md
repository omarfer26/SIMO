# SIMO

# 🛒 Backend Inventario y Ventas Retail - Guía de Docker

Este proyecto contiene el backend para el sistema de inventario y ventas retail desarrollado en **Node.js (Express)** conectado a una base de datos **PostgreSQL**, totalmente orquestado mediante **Docker y Docker Compose**.

---

## 🛠️ Tecnologías y Versiones Utilizadas

| Tecnología / Servicio | Versión de Imagen / Runtime | Descripción |
| :--- | :--- | :--- |
| **Node.js** | `node:18-alpine` | Runtime principal del backend (Entorno liviano Alpine) |
| **PostgreSQL** | `postgres:18-alpine` | Motor de Base de Datos Relacional |
| **Express.js** | `^4.x` | Framework Web para la API REST |
| **pg (node-postgres)** | `^8.x` | Cliente nativo de PostgreSQL para Node.js |
| **Docker Compose** | Especificación V2 | Orquestador de contenedores |

---

## 📁 Archivos de Configuración Docker

El entorno cuenta con los siguientes archivos en la raíz del proyecto:

1. **`Dockerfile`**: Define los pasos de construcción de la imagen de Node.js.
2. **`docker-compose.yml`**: Define y orquesta los servicios `db` (PostgreSQL) y `app` (Node.js API).
3. **`.dockerignore`**: Previene la copia no deseada de `node_modules` y archivos locales hacia la imagen.
4. **`.env`**: Archivo de variables de entorno con las credenciales y puertos del proyecto.

---

## ⚙️ Variables de Entorno (`.env`)

Asegúrate de tener un archivo `.env` en la raíz con el siguiente formato:

```env
DB_USER=postgres
DB_PASSWORD=123456
DB_HOST=localhost
DB_PORT=5432
DB_NAME=retail
PORT=3000

🚀 Guía de Inicio Rápido
Requisitos Previos
Tener Docker Desktop instalado y en ejecución.

1. Construir e Iniciar los Contenedores
Ejecuta el siguiente comando en la terminal desde la raíz del proyecto:

Bash
docker-compose up -d --build
(O utilizando la sintaxis moderna de Docker CLI: docker compose up -d --build)

--build: Fuerza la reconstrucción de la imagen del backend con los cambios más recientes.

-d: Inicia los servicios en segundo plano (detached mode).

2. Verificar el Estado de los Servicios
Para confirmar que los contenedores están activos y ejecutándose:

Bash
docker ps
Deberías ver dos contenedores activos:

retail_backend (Puerto 3000)

retail_db (Puerto 5432)

3. Ver Logs en Tiempo Real
Para revisar la consola y depurar tu aplicación o la base de datos:

Logs del Backend (Node.js):

Bash
docker logs retail_backend -f
Logs de PostgreSQL:

Bash
docker logs retail_db -f
4. Detener los Servicios
Detener los contenedores conservando los datos:

Bash
docker-compose down
Detener los contenedores y reiniciar la Base de Datos limpia (elimina volúmenes):

Bash
docker-compose down -v
🗄️ Conexión a la Base de Datos (DBeaver / pgAdmin / VS Code)
Puedes conectarte desde cualquier cliente local con los siguientes datos:

Host: localhost

Puerto: 5432

Base de Datos: retail

Usuario: postgres

Contraseña: 123456

🧪 Prueba del Endpoint (POST /api/products)
Una vez levantados los contenedores, puedes probar el endpoint de creación de productos ejecutando la siguiente solicitud:

Método: POST

URL: http://localhost:3000/api/products

Headers: Content-Type: application/json

Body:

JSON
{
  "id_categoria": 1,
  "codigo_barras": "7701234567890",
  "nombre": "Teclado Mecánico RGB",
  "descripcion": "Teclado para juegos con switches red",
  "precio_compra": 45.00,
  "precio_venta": 75.00,
  "stock_minimo": 5
}