-- =====================================================================
-- SIMO - Rol de base de datos para la API (principio de mínimo privilegio)
--
-- La API se conecta como simo_app, no como superusuario:
--   * puede leer y escribir datos, pero no crear ni borrar tablas, ni borrar
--     registros con historial (ventas, clientes, productos, pedidos...);
--   * NO puede modificar ni borrar el Kardex, el historial de pedidos ni
--     el log de auditoría (además de los triggers, se le niega el permiso).
--
-- Lo ejecuta db/00_init.sh cuando SIMO_APP_PASSWORD está definida:
--   psql -v app_password='...' -f db/roles/001_rol_aplicacion.sql
-- Se puede re-ejecutar: si el rol existe, solo actualiza la contraseña.
-- =====================================================================

SELECT format('CREATE ROLE simo_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'simo_app')
\gexec

SELECT format('ALTER ROLE simo_app WITH LOGIN PASSWORD %L', :'app_password')
\gexec

BEGIN;

SELECT format('GRANT CONNECT ON DATABASE %I TO simo_app', current_database())
\gexec

GRANT USAGE ON SCHEMA public TO simo_app;
-- Sin DELETE (SCRUM-174): la API nunca borra, inactiva. Solo puede borrar en
-- usuarios (las llaves foráneas protegen a quien tiene historial) y en
-- jwt_blacklist. Ver migración 026.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO simo_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM simo_app;
GRANT DELETE ON usuarios, jwt_blacklist TO simo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO simo_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO simo_app;

-- Tablas de solo inserción
REVOKE UPDATE, DELETE, TRUNCATE ON movimientos_inventario   FROM simo_app;
REVOKE UPDATE, DELETE, TRUNCATE ON historial_estados_pedido FROM simo_app;
REVOKE UPDATE, DELETE, TRUNCATE ON log_auditoria            FROM simo_app;

-- Catálogos del sistema: la API solo los consulta
REVOKE INSERT, UPDATE, DELETE ON roles, unidades_medida, metodos_pago FROM simo_app;

-- Líneas de venta: solo inserción (inalterables, migración 026)
REVOKE UPDATE ON detalles_ventas FROM simo_app;

-- Tablas creadas por migraciones futuras quedan disponibles para la API
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE ON TABLES TO simo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE DELETE ON TABLES FROM simo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO simo_app;

COMMIT;
