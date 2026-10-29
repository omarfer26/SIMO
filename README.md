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
| **Node.js** | `node:18-alpine` | Runtime principal del backend (Entorno liviano Alpine) |
| **PostgreSQL** | `postgres:18-alpine` | Motor de Base de Datos Relacional |
| **Express.js** | `^4.x` | Framework Web para la API REST |
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
DB_NAME=simo_retail
PORT=3000
SIMO_SEED=true
```

Al crear el contenedor por primera vez, PostgreSQL ejecuta automáticamente las migraciones de `backend/db/migrations` y los datos de prueba de `backend/db/seeds` (ver `backend/db/README.md`).

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
- **Base de Datos**: simo_retail
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

## 👤 Endpoints de Usuarios (SCRUM-22, SCRUM-23)

> Protegidos con JWT (`Authorization: Bearer <token>` de `POST /api/auth/login`). Listar y consultar: `ADMIN` y `GERENTE`; crear, editar y cambiar estado: `ADMIN`.

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/api/users` | Crea un usuario. Body: `id_rol`, `nombre_completo`, `correo`, `usuario`, `password` (mín. 8) |
| GET | `/api/users` | Lista paginada. Query opcional: `page`, `limit` (1-100, por defecto 10), `estado` (`true`/`false`), `id_rol`, `rol` (`ADMIN`, `GERENTE`, `INVENTARIO`, `VENDEDOR`), `q` (busca en nombre, correo o usuario) |
| GET | `/api/users/:id` | Detalle de un usuario |
| PUT | `/api/users/:id` | Edita `id_rol`, `nombre_completo`, `correo` y/o `usuario` (al menos uno). No cambia la contraseña ni el estado. No permite quitar el rol al último administrador activo (`409`) |
| PATCH | `/api/users/:id/status` (alias `/estado`) | Activa o inactiva: `{ "estado": true \| false }`. Inactivar corta de inmediato las sesiones abiertas e impide el login. No permite inactivar al último administrador activo (`409`) |

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

Errores: `400` parámetros inválidos, `404` usuario inexistente, `409` correo o usuario duplicado (en `PUT`, si pertenecen a **otro** usuario) o intento de dejar el sistema sin administradores. Formato: `{ "error": "Bad Request", "message": "..." }`. La contraseña nunca se devuelve.

**Pruebas automáticas** (requieren la base creada con el seed): `npm test`

### 📦 Ingreso de mercancía a Bodega (SCRUM-94 / HU-05)

> Pendiente de protección con JWT + roles `INVENTARIO` / `ADMIN` (SCRUM-16 / SCRUM-18). Mientras tanto, el usuario responsable se envía en `id_usuario`.

`POST /api/inventory/entries` registra una compra a proveedor: suma **únicamente** al stock de Bodega y deja el movimiento en el Kardex, todo en una sola operación atómica.

| Campo | Obligatorio | Descripción |
| :--- | :--- | :--- |
| `id_producto` o `sku` | Sí (uno de los dos) | Producto que ingresa; debe existir y estar activo |
| `cantidad` | Sí | Mayor a cero; entera si el producto se maneja por unidad, hasta 3 decimales si es por kg / g / L |
| `id_usuario` | Sí (temporal) | Usuario responsable del ingreso |
| `costo_unitario` | No | Costo de esta compra; por defecto, el precio de compra del producto |
| `id_proveedor` | No | Proveedor de la mercancía |
| `documento_referencia` | No | Número de la factura o remisión del proveedor |
| `observacion` | No | Nota libre (máx. 500 caracteres) |

```json
{ "sku": "ELEC-001", "cantidad": 10, "id_usuario": 3, "id_proveedor": 1, "documento_referencia": "FAC-0001" }
```

Respuesta `201`:

```json
{
  "message": "Ingreso a Bodega registrado exitosamente",
  "movimiento": { "id_movimiento": 1, "tipo_movimiento": "ENTRADA_COMPRA", "ubicacion_destino": "BODEGA",
                  "cantidad": "10.000", "costo_unitario": "58400.00", "saldo_bodega": "10.000", "saldo_almacen": "0.000",
                  "id_usuario": 3, "id_proveedor": 1, "documento_referencia": "FAC-0001", "observacion": null, "fecha_movimiento": "..." },
  "producto": { "id_producto": 1, "sku": "ELEC-001", "nombre": "Audífonos Bluetooth X200",
                "stock_bodega": "10.000", "stock_almacen": "0.000", "stock_total": "10.000" }
}
```

Errores: `400` datos inválidos (p. ej. "La cantidad ingresada debe ser mayor a cero"), `404` producto inexistente, `409` producto inactivo.

### 🧾 Compras a proveedor (SCRUM-45)

> Protegido con JWT; roles `INVENTARIO` / `ADMIN` (consulta también `GERENTE`).

`POST /api/inventory/purchases` registra una compra con varias líneas y, por defecto, la **confirma**: todas las líneas ingresan a Bodega en una sola operación con el procedimiento `sp_confirmar_compra`. Si una línea es inválida no se registra nada.

```json
{ "id_proveedor": 1, "documento_referencia": "FAC-0001",
  "lineas": [ { "sku": "ELEC-001", "cantidad": 10, "costo_unitario": 58000 }, { "id_producto": 3, "cantidad": 2.5 } ] }
```

- `confirmar: false` la deja en `BORRADOR` sin mover el stock.
- Sin `costo_unitario`, la línea usa el precio de compra del producto.
- `GET /api/inventory/purchases/:id` devuelve la compra con sus líneas y el stock actual de cada producto.
- Errores: `400` datos inválidos o producto repetido, `404` producto o compra inexistente, `409` producto inactivo.
- Una compra confirmada no se puede modificar (lo impide la base de datos).

### 🔧 Ajustes manuales de stock (SCRUM-42)

> Protegido con JWT; roles `INVENTARIO` / `ADMIN`. Contrato del formulario del frontend (SCRUM-38).

`POST /api/inventory/adjustments` (alias `/api/inventory/adjust`) corrige el stock de **una** ubicación por mermas, daños o sobrantes de conteo:

```json
{ "id_producto": 1, "tipo_movimiento": "AJUSTE_NEGATIVO", "ubicacion": "ALMACEN", "cantidad": 3, "motivo": "3 unidades llegaron con la caja rota" }
```

Responde `201`:

```json
{ "message": "Ajuste registrado",
  "ajuste": { "id_movimiento": 123, "fecha_movimiento": "...", "tipo_movimiento": "AJUSTE_NEGATIVO", "ubicacion": "ALMACEN",
              "cantidad": "3.000", "saldo_bodega": "8.000", "saldo_almacen": "1.000", "costo_unitario": "...", "motivo": "...", "id_usuario": 3, "id_producto": 1 } }
```

- `motivo` es obligatorio (se acepta también `justificacion`); el responsable sale del token.
- Opcional `costo_unitario` (si no, se usa el precio de compra del producto).
- La función `fn_registrar_ajuste` (migración 014) bloquea el producto, cambia el stock, deja el movimiento en el Kardex y el registro `AJUSTE_INVENTARIO` en `log_auditoria`, todo o nada.
- Errores: `400` dato inválido o motivo vacío, `404` producto inexistente, `409` stock insuficiente en esa ubicación o producto inactivo.

### 📒 Kardex de un producto (SCRUM-43)

> Protegido con JWT; roles `INVENTARIO` / `ADMIN` / `GERENTE` (el Vendedor no ve costos). Contrato de la tabla del frontend (SCRUM-39).

`GET /api/inventory/kardex/:id_producto` devuelve el historial **completo y en orden cronológico**, con los saldos y la valorización que recalcula `fn_kardex_producto` (migración 012):

```json
{ "producto": { "id_producto": 1, "sku": "ELEC-001", "nombre": "...", "unidad": "und", "stock_bodega": "8.000", "stock_almacen": "4.000",
                "stock_total": "12.000", "valor_inventario": "717619.20", "consistente": true },
  "movimientos": [ { "id_movimiento": 101, "fecha_movimiento": "...", "tipo_movimiento": "SALIDA_VENTA",
                     "entrada_bodega": "0", "salida_bodega": "0", "entrada_almacen": "0", "salida_almacen": "3.000",
                     "saldo_bodega": "8.000", "saldo_almacen": "4.000", "saldo_total": "12.000",
                     "costo_unitario": "59801.60", "costo_promedio": "59801.60", "saldo_valorizado": "717619.20",
                     "saldo_coincide": true, "documento_referencia": null, "motivo": null,
                     "id_usuario": 4, "nombre_usuario": "Vendedor SIMO", "id_venta": 1112, "id_pedido": null, "id_compra": null } ] }
```

- Filtros opcionales `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (inclusivos, hora de Colombia) o fecha y hora ISO 8601. Filtrar no cambia los saldos: siempre se calculan desde el primer movimiento.
- `saldo_coincide: false` marca un movimiento cuyo saldo guardado no cuadra; `producto.consistente` resume la auditoría del producto.
- Errores: `400` id o fechas inválidas, `404` producto inexistente.

### 📝 Pedidos de clientes (SCRUM-81 / HU-10)

> Protegido con JWT. Registran `VENDEDOR` / `GERENTE` / `ADMIN`; consulta también `INVENTARIO`.

`POST /api/orders` registra el pedido en estado `REGISTRADO`:

```json
{ "id_cliente": 1, "fecha_entrega_pactada": "2026-10-30", "direccion_entrega": "Calle 10 # 5-20", "observaciones": "En la mañana",
  "lineas": [ { "id_producto": 1, "cantidad": 3 }, { "sku": "FERR-001", "cantidad": 1.25 } ] }
```

- Responde `201` con `{ message, pedido }`: cabecera, `lineas` (con `disponible` según el stock de hoy) e `historial` de estados.
- El precio de cada línea es el **precio de venta vigente** del producto; el total lo calcula la base (migración 015).
- Una fecha sin hora se pacta para el final de ese día (hora de Colombia) y no puede estar en el pasado.
- **No descuenta stock**: eso ocurre al pasar a `EN_PREPARACION` (SCRUM-61). Si hoy no alcanza, la respuesta trae `advertencia`.
- Errores: `400` datos inválidos o producto repetido, `404` cliente o producto inexistente, `409` cliente o producto inactivo.

Consulta:

- `GET /api/orders?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&estado=&id_cliente=` → `{ data: [ { id_pedido, nombre_cliente, nombre_usuario, estado, fecha_solicitud, fecha_entrega_pactada, total, vencido, cantidad_productos, ... } ] }` (contrato de la lista del frontend, SCRUM-125), más recientes primero.
- `GET /api/orders/:id` → `{ pedido }` con líneas e historial.
- Desde `EN_PREPARACION` las líneas del pedido ya no se pueden modificar (lo impide la base de datos).

#### Cambio de estado (SCRUM-61)

`PATCH /api/orders/:id/status` (alias `/estado`), roles `VENDEDOR` / `INVENTARIO` / `GERENTE` / `ADMIN`:

```json
{ "estado": "EN_PREPARACION" }
{ "estado": "CANCELADO", "motivo": "El cliente desistió" }
```

- Ciclo de un paso a la vez: `REGISTRADO → CONFIRMADO → EN_PREPARACION → LISTO → ENTREGADO`; `CANCELADO` desde cualquier estado antes de `ENTREGADO`, **con motivo**.
- Al pasar a `EN_PREPARACION` se **descuenta el stock** de cada línea: primero del Almacén y luego de Bodega (RN-02), con movimientos `SALIDA_PEDIDO` en el Kardex. Si a una línea no le alcanza, no se descuenta nada y el pedido no avanza.
- Al cancelar un pedido que ya descontó, cada cantidad vuelve a su ubicación (`REVERSO_PEDIDO`) y la cancelación queda en `log_auditoria`.
- Responde `200` con `{ message, id_pedido, estado, pedido }` (el frontend lee `estado`).
- Errores: `400` estado inválido o cancelación sin motivo, `404` pedido inexistente, `409` transición fuera del ciclo o stock insuficiente.
- Todo ocurre en la función `fn_cambiar_estado_pedido` (migración 016), en una sola transacción.

### 🧑‍🤝‍🧑 Gestión de clientes (SCRUM-98 / HU-09)

> Pendiente de protección con JWT + roles `VENDEDOR` / `GERENTE` / `ADMIN` (SCRUM-16 / SCRUM-18).

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/api/customers` | Registra un cliente. Body: `identificacion` y `nombre` (obligatorios), `tipo_identificacion` (`CC` por defecto; `CE`, `NIT`, `TI`, `PAS`), `telefono`, `correo`, `direccion` |
| GET | `/api/customers` | Lista paginada. Query: `q` (documento por prefijo, aunque se escriba con puntos, o nombre), `estado` (`true`/`false`), `page`, `limit` (1-100, por defecto 10). Pensado para el autocompletado del POS |
| GET | `/api/customers/document/:documento` | Busca por documento exacto |
| GET | `/api/customers/:id` | Detalle del cliente |
| PUT | `/api/customers/:id` | Edita `nombre`, `telefono`, `correo`, `direccion` o `estado`. **El documento no se puede modificar** |
| GET | `/api/customers/:id/history` | Historial: resumen (compras completadas, total comprado, última compra, pedidos abiertos) y las últimas compras y pedidos (`limit`, por defecto 20) |

- El documento se guarda sin puntos ni espacios: `1.090.123.456` → `1090123456`.
- Si el documento ya existe, `POST` responde `409` con el mensaje *"El documento de identidad ya se encuentra registrado."* y devuelve el cliente existente en `cliente`, para cargarlo en pantalla.
- Errores: `400` datos inválidos, `404` cliente inexistente, `409` documento duplicado.

---

## 🚀 Despliegue

El despliegue del sistema (PostgreSQL, API, frontend, respaldos diarios y Cloudflare Tunnel) está en la carpeta `deploy/`. Ver `deploy/README.md` para la operación y `deploy/GUIA_EQUIPO.md` para conectarse a la base de datos compartida.
```
