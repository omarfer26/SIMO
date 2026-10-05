# SIMO

Sistema web para la gestión integral de inventarios, ventas y trazabilidad de pedidos en pequeñas empresas del sector retail (comercio minorista tipo San Andresito / Alejandría). Trabajo de grado — UFPS, Ingeniería de Sistemas.

---

## 💻 Frontend (Aplicación Web)

El frontend de este sistema está desarrollado como una aplicación moderna, responsiva y orientada a la experiencia del usuario (UX).

### Tecnologías y Frameworks Utilizados

| Tecnología / Framework | Descripción |
| :--- | :--- |
| **Next.js (App Router)** | Framework de React para renderizado del lado del servidor (SSR), optimización de rutas y mejor SEO. |
| **React** | Librería principal para la construcción de interfaces de usuario mediante componentes reutilizables. |
| **Tailwind CSS** | Framework de CSS utility-first para diseño rápido, flexible y responsivo, sin necesidad de escribir CSS personalizado extenso. |
| **TypeScript** | Superset de JavaScript que añade tipado estático, reduciendo errores y mejorando la consistencia del código. |

### Características del Frontend
- Interfaz gráfica moderna, ágil y atractiva visualmente.
- Navegación rápida entre los diferentes módulos (Inventario, Ventas, Pedidos, Usuarios).
- Uso de componentes de interfaz modulares.

---

## 🛒 Backend Inventario y Ventas Retail - Guía de Docker

Este proyecto contiene el backend para el sistema de inventario y ventas retail desarrollado en **Node.js (Express)** conectado a una base de datos **PostgreSQL**, totalmente orquestado mediante **Docker y Docker Compose**.

### 🛠️ Tecnologías y Versiones Utilizadas

| Tecnología / Servicio | Versión de Imagen / Runtime | Descripción |
| :--- | :--- | :--- |
| **Node.js** | `node:22-alpine` | Runtime principal del backend (Entorno liviano Alpine) |
| **PostgreSQL** | `postgres:18-alpine` | Motor de Base de Datos Relacional |
| **Express.js** | `^5.x` | Framework Web para la API REST |
| **pg (node-postgres)** | `^8.x` | Cliente nativo de PostgreSQL para Node.js |
| **Docker Compose** | Especificación V2 | Orquestador de contenedores |

### 📁 Archivos de Configuración Docker

El entorno cuenta con los siguientes archivos en la raíz del proyecto:

1. **`Dockerfile`**: Define los pasos de construcción de la imagen de Node.js.
2. **`docker-compose.yml`**: Define y orquesta los servicios `db` (PostgreSQL) y `app` (Node.js API).
3. **`.dockerignore`**: Previene la copia no deseada de `node_modules` y archivos locales hacia la imagen.
4. **`.env`**: Archivo de variables de entorno con las credenciales y puertos del proyecto.

### ⚙️ Variables de Entorno (`.env`)

Asegúrate de tener un archivo `.env` en la raíz con el siguiente formato:

```env
DB_USER=postgres
DB_PASSWORD=123456
DB_HOST=localhost
DB_PORT=5432
DB_NAME=retail
PORT=3000
SIMO_SEED=true
```

Al crear el contenedor por primera vez, PostgreSQL ejecuta automáticamente las migraciones de `backend/db/migrations` y, si `SIMO_SEED=true`, los datos de prueba de `backend/db/seeds` (ver `backend/db/README.md`).

### 🚀 Guía de Inicio Rápido

**Requisitos Previos**: Tener Docker Desktop instalado y en ejecución.

#### 1. Construir e Iniciar los Contenedores
Ejecuta el siguiente comando en la terminal desde la raíz del proyecto:

```bash
docker-compose up -d --build
```
*(O utilizando la sintaxis moderna de Docker CLI: `docker compose up -d --build`)*

- `--build`: Fuerza la reconstrucción de la imagen del backend con los cambios más recientes.
- `-d`: Inicia los servicios en segundo plano (detached mode).

#### 2. Verificar el Estado de los Servicios
Para confirmar que los contenedores están activos y ejecutándose:

```bash
docker ps
```
Deberías ver dos contenedores activos:
- `retail_backend` (Puerto 3000)
- `retail_db` (Puerto 5432)

#### 3. Ver Logs en Tiempo Real
Para revisar la consola y depurar tu aplicación o la base de datos:

- **Logs del Backend (Node.js)**:
  ```bash
  docker logs retail_backend -f
  ```
- **Logs de PostgreSQL**:
  ```bash
  docker logs retail_db -f
  ```

#### 4. Detener los Servicios
Detener los contenedores conservando los datos:
```bash
docker-compose down
```

Detener los contenedores y reiniciar la Base de Datos limpia (elimina volúmenes):
```bash
docker-compose down -v
```

### 🗄️ Conexión a la Base de Datos (DBeaver / pgAdmin / VS Code)
Puedes conectarte desde cualquier cliente local con los siguientes datos:
- **Host**: localhost
- **Puerto**: 5432
- **Base de Datos**: retail
- **Usuario**: postgres
- **Contraseña**: 123456

### 🧪 Prueba del Endpoint (POST `/api/products`)
Una vez levantados los contenedores, puedes probar el endpoint de creación de productos ejecutando la siguiente solicitud:

- **Método**: POST
- **URL**: `http://localhost:3000/api/products`
- **Headers**: `Content-Type: application/json`
- **Body**:

```json
{
  "id_categoria": 1,
  "id_unidad": 1,
  "sku": "7701234567890",
  "nombre": "Teclado Mecánico RGB",
  "descripcion": "Teclado para juegos con switches red",
  "precio_compra": 45.00,
  "precio_venta": 75.00,
  "stock_minimo_bodega": 10,
  "stock_minimo_almacen": 5
}
```

### 👤 Endpoints de Usuarios (SCRUM-22, SCRUM-23)

> Pendiente de protección con JWT + rol `ADMIN` (SCRUM-16 / SCRUM-18).

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/api/users` | Crea un usuario. Body: `id_rol`, `nombre_completo`, `correo`, `usuario`, `password` (mín. 8) |
| GET | `/api/users` | Lista paginada. Query opcional: `page`, `limit` (1-100, por defecto 10), `estado` (`true`/`false`), `id_rol`, `rol` (`ADMIN`, `GERENTE`, `INVENTARIO`, `VENDEDOR`), `q` (busca en nombre, correo o usuario) |
| GET | `/api/users/:id` | Detalle de un usuario |

Ejemplo: `GET /api/users?rol=VENDEDOR&estado=true&page=1&limit=10`

```json
{
  "data": [
    { "id_usuario": 4, "nombre_completo": "Vendedor SIMO", "correo": "vendedor@simo.local", "usuario": "vendedor",
      "estado": true, "id_rol": 4, "rol_codigo": "VENDEDOR", "rol_nombre": "Vendedor",
      "bloqueado_hasta": null, "ultimo_acceso": null, "creado_en": "...", "actualizado_en": "..." }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Errores: `400` parámetros inválidos, `404` usuario inexistente, `409` correo o usuario duplicado. Formato: `{ "error": "Bad Request", "message": "..." }`. La contraseña nunca se devuelve.

**Pruebas automáticas** (requieren la base creada con el seed): `npm test`

---

## 🚀 Despliegue

El despliegue del sistema (PostgreSQL, API, frontend, respaldos diarios y Cloudflare Tunnel) está en la carpeta `deploy/`. Ver `deploy/README.md` para la operación y `deploy/GUIA_EQUIPO.md` para conectarse a la base de datos compartida.
