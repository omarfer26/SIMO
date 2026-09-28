# Conectarse a la base de datos compartida de SIMO

> **Ver la aplicación web:** entra a <https://app.alejandrostore.com> con tu correo de la UFPS (te llega un código). No necesitas instalar nada. El login de la aplicación todavía es simulado: cualquier dato te deja entrar y los datos que ves son de ejemplo.

La base de datos del proyecto corre en un servidor del equipo y se publica por Cloudflare en `db.alejandrostore.com`. Solo pueden entrar los correos autorizados. Esta guía se hace una sola vez por computador.

## 1. Instalar cloudflared

- **Windows:** descargar el instalador `.msi` desde la [página oficial de Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), o en PowerShell:
  ```powershell
  winget install --id Cloudflare.cloudflared
  ```
- **macOS:**
  ```bash
  brew install cloudflared
  ```
- **Linux:** paquete `.deb` / `.rpm` de la misma página oficial.

## 2. Abrir la conexión

Cada vez que quieras trabajar con la base, deja abierta una terminal con:

```bash
cloudflared access tcp --hostname db.alejandrostore.com --url localhost:15432
```

La primera vez se abre el navegador: escribe tu correo (el que está autorizado en el proyecto) e ingresa el código que te llega. Mientras esa terminal siga abierta, la base está disponible en tu computador en `localhost:15432`.

## 3. Conectar pgAdmin o DBeaver

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Puerto | `15432` |
| Base de datos | `simo_retail` |
| Usuario / contraseña | los que te comparta Ramón por un canal privado (no por el grupo) |

## Buenas prácticas

- La base compartida es para integrar y probar entre todos. Para experimentar, usa tu base local con Docker: `docker compose up -d` desde `backend/`, que trae datos de prueba.
- No cambies la estructura (tablas, columnas) directamente en la base compartida. Todo cambio va como una migración nueva en `backend/db/migrations/`, por Pull Request.
- Si la conexión falla, avisa en el grupo: puede que el servidor esté apagado o sin internet.
