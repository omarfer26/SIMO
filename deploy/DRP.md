# SIMO — Plan de Recuperación ante Desastres (DRP)

SCRUM-171 · Versión 1.0 · 19/11/2026 · Responsable: Backend (Ramón Machuca)

Este documento dice **qué se respalda, dónde, cada cuánto y cómo se recupera** SIMO si
se pierde la base de datos, el servidor de la API o una credencial. Está escrito para
que cualquier integrante del equipo lo pueda seguir paso a paso.

## 1. Objetivos

| Indicador | Meta | Cómo se logra |
|---|---|---|
| **RPO** (datos que se pueden perder como máximo) | **24 horas**; **minutos** si el error se detecta en menos de 6 horas | Respaldo diario a las 03:00 + historial de Neon de 6 horas |
| **RTO** (tiempo máximo para volver a operar) | **1 hora** | Restauración verificada en un solo comando (simulacro: 25 s para la base actual, 1 s de restauración para 360.000 registros) |
| Retención | 14 días de respaldos diarios | Artefactos de GitHub y carpeta `deploy/backups` |

## 2. Qué hay que proteger

| Activo | Dónde está | Criticidad |
|---|---|---|
| Base de datos `neondb` (ventas, Kardex, pedidos, clientes, auditoría) | Neon, proyecto `retail`, región AWS us-east-2, PostgreSQL 18 | **Crítica**: es lo único que no se puede reconstruir |
| Código (API, frontend, migraciones, scripts) | GitHub `omarfer26/SIMO` | Alta, pero tiene copia en cada computador del equipo |
| API (Node 22) | Servidor de despliegue | Media: se vuelve a desplegar desde el código |
| Frontend (Next.js) | Servidor de despliegue / Vercel | Media: igual que la API |
| Secretos (`DATABASE_URL`, `JWT_SECRET`, clave de cifrado) | Panel del proveedor y secretos de GitHub | Alta: sin ellos no se restaura ni se arranca |

El esquema completo (tablas, funciones, triggers) se reconstruye desde
`backend/db/migrations`; **los datos solo existen en Neon y en los respaldos**.

## 3. Capas de respaldo

| Capa | Frecuencia | Retención | Dónde | Protege contra |
|---|---|---|---|---|
| 1. Historial de Neon (restauración a un punto en el tiempo) | Continua | 6 horas | Neon | Error humano o de programa reciente (borrado, carga equivocada) |
| 2. `pg_dump` diario en GitHub Actions (`.github/workflows/respaldo-neon.yml`) | 03:00 hora Colombia | 14 días | Artefactos de GitHub, **cifrados** AES-256 | Pérdida del proyecto de Neon, error detectado tarde |
| 3. `pg_dump` diario del contenedor `backup` (`deploy/backup/respaldo.sh`) | 03:00 | 14 días | Carpeta `deploy/backups` del servidor de despliegue | Igual que la 2, mientras ese servidor exista |

Cada respaldo diario:

1. Se genera con `pg_dump --format=custom` (formato comprimido de PostgreSQL).
2. Se verifica que su índice se lea (`pg_restore --list`) y se guarda su suma **SHA-256**.
3. En GitHub, además, **se restaura todos los días en una base limpia** y se exige que el
   inventario cuadre con `sp_auditar_kardex(p_estricto => true)` (SCRUM-169). Si la
   prueba falla, la ejecución falla y GitHub avisa por correo al dueño del repositorio.
4. Se cifra antes de guardarse (el repositorio puede ser público).

> **Estado al 19/11/2026:** el respaldo de GitHub **falló en sus 30 ejecuciones** desde
> el 20/10/2026 porque el repositorio no tiene configurados los secretos
> `NEON_BACKUP_URL` y `RESPALDO_CLAVE`. Hoy solo funciona la capa 3, que corre en la Mac
> que se va a desconectar. **Configurar los secretos es la acción pendiente más
> importante del plan** (sección 7).

## 4. Escenarios y procedimientos

### E1. Se borraron o dañaron datos hace menos de 6 horas

*Ejemplo: una carga de datos equivocada, un error de programa.* Usar el historial de Neon:

1. Panel de Neon > proyecto `retail` > **Branches** > **Create branch** > "Past data"
   y elegir la hora anterior al error. Se crea una rama nueva; la principal no cambia.
2. Verificar la rama nueva con su cadena de conexión:
   `psql "<cadena de la rama>" -c "CALL sp_auditar_kardex(p_estricto => true)"`.
3. Si está bien, desde el panel **restaurar la rama principal** a ese punto
   (Branches > main > Restore) o apuntar la API a la rama nueva.
4. Volver a aplicar los permisos de la API (paso P4).

### E2. Error detectado después de 6 horas, o se perdió el proyecto de Neon

Restaurar el último respaldo diario sano (procedimiento P):

**P1. Descargar el respaldo.** GitHub > Actions > "Respaldo diario Neon" > ejecución del
día > Artifacts. Descomprimir el `.zip`.

**P2. Descifrar y comprobar** (pide la frase `RESPALDO_CLAVE`):

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in simo_neon_AAAAMMDD_HHMM.dump.enc -out simo_neon_AAAAMMDD_HHMM.dump
```

```bash
sha256sum -c simo_neon_AAAAMMDD_HHMM.dump.sha256
```

**P3. Crear la base destino.** En Neon, una rama nueva o un proyecto nuevo
(PostgreSQL 18). Copiar su cadena **directa** (sin `-pooler`).

**P4. Restaurar y verificar** (con Docker, sin instalar nada; desde la raíz del repositorio):

```bash
docker run --rm -e SIMO_APP_PASSWORD -v "$PWD:/r" -w /r postgres:18-alpine sh deploy/backup/restaurar.sh simo_neon_AAAAMMDD_HHMM.dump "<cadena directa destino>"
```

`restaurar.sh` comprueba la suma SHA-256, restaura en **una sola transacción** (si algo
falla, la base destino no cambia), cuenta las filas, audita el inventario y, con
`SIMO_APP_PASSWORD` definida, recrea los permisos mínimos del rol `simo_app` (los
respaldos no incluyen roles). Resultado:

| Salida | Significado | Qué hacer |
|---|---|---|
| 0 | Restaurado y verificado | Seguir con P5 |
| 1 | Archivo dañado, alterado o base destino no vacía | Usar el respaldo del día anterior o una base vacía |
| 3 | Restaurado, pero el inventario no cuadra | **No poner en servicio.** Revisar `SELECT * FROM fn_auditar_documentos_kardex()` y probar el respaldo anterior |

Si el rol `simo_app` no existe en un proyecto nuevo, crearlo en el panel de Neon
(Roles > New role) antes del paso P4.

**P5. Reconectar la API.** Cambiar `DATABASE_URL` del servidor de la API por la cadena
**con pooler** del rol `simo_app` en la base restaurada y reiniciar la API.

**P6. Comprobar el servicio.** `GET /api/health` responde 200; iniciar sesión como gerente
y revisar el dashboard y `GET /api/inventory/kardex-audit` (`consistente: true`).

**P7. Informar** al equipo la fecha del respaldo usado: las operaciones posteriores a esa
hora se deben volver a registrar.

### E3. Cayó el servidor de la API o del frontend

Los datos no se ven afectados (están en Neon). Volver a desplegar desde el código con la
guía de despliegue (`deploy/README.md`) y las mismas variables de entorno. Comprobar con P6.

### E4. Se filtró una credencial

1. **Base de datos:** panel de Neon > Roles > el rol afectado > *Reset password*. Actualizar
   `DATABASE_URL` de la API y el secreto `NEON_BACKUP_URL` de GitHub.
2. **`JWT_SECRET`:** cambiarlo en el servidor y reiniciar la API (cierra todas las sesiones).
3. **`RESPALDO_CLAVE`:** cambiar el secreto de GitHub. Los respaldos anteriores siguen
   necesitando la clave anterior: guardarla hasta que venzan (14 días).
4. Revisar `log_auditoria` por acciones extrañas desde la fecha de la filtración.

### E5. El respaldo más reciente está dañado

`restaurar.sh` lo detecta (salida 1 o 3). Usar el del día anterior: hay 14 días disponibles.

## 5. Roles

| Rol | Persona | Responsabilidad |
|---|---|---|
| Responsable del plan | Backend (Ramón Machuca) | Ejecutar la recuperación y los simulacros |
| Dueño del repositorio | Omar Suárez | Secretos de GitHub y avisos de fallas del respaldo |
| Dueño del proyecto de Neon | Johan López | Acceso al panel de Neon, restauración desde el historial, roles |
| Equipo | Todos | Avisar en el grupo si la aplicación falla o los datos se ven mal |

## 6. Pruebas del plan (simulacros)

La prueba de restauración del respaldo de GitHub corre **todos los días** de forma
automática. Además, una vez por sprint, se repite a mano el procedimiento P completo.

| Fecha | Prueba | Resultado |
|---|---|---|
| 19/11/2026 | Respaldo de Neon (260 KB) + restauración verificada + cifrado y descifrado con SHA-256, mismos pasos del workflow | Correcto en 25 s; inventario consistente; permisos de `simo_app` aplicados |
| 19/11/2026 | Respaldo y restauración de la base de carga (2.021 productos, 50.014 ventas, 158.625 movimientos, 6,7 MB) | Restaurada y verificada en 1 s; las 141 pruebas de integración pasan contra ella como `simo_app` |
| 19/11/2026 | Respaldo con un byte alterado | Rechazado antes de restaurar (salida 1) |
| 19/11/2026 | Respaldo de una base con 11 productos con el Kardex desordenado | Restaurado pero rechazado para servicio (salida 3) |

## 7. Pendientes para que el plan quede completo

1. **Configurar los secretos** `NEON_BACKUP_URL` y `RESPALDO_CLAVE` en GitHub (Settings >
   Secrets and variables > Actions) y lanzar el workflow a mano una vez (Actions >
   Respaldo diario Neon > Run workflow). Lo debe hacer el dueño del repositorio.
2. Que el workflow actualizado llegue a la rama `main` (GitHub solo programa desde ella).
3. Guardar `RESPALDO_CLAVE` en un gestor de contraseñas de al menos dos integrantes:
   sin ella los respaldos no se pueden descifrar.
4. Cambiar la contraseña del rol dueño de Neon, que estuvo en el repositorio (E4).
