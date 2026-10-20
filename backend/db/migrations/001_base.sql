-- =====================================================================
-- SIMO - Migración 001: utilidades base (SCRUM-84)
-- Motor: PostgreSQL 16+ (desarrollado para 18)
--
-- Funciones compartidas por el resto de migraciones:
--   * fn_set_actualizado_en   -> mantiene la columna actualizado_en
--   * fn_usuario_sesion       -> id del usuario que ejecuta la transacción
--   * fn_bloquear_modificacion -> vuelve inalterable una tabla (Kardex,
--                                 historial de pedidos, auditoría)
--
-- Convención para el backend: dentro de cada transacción que modifique
-- pedidos (u otras tablas que registren responsable automáticamente),
-- ejecutar primero:
--     SELECT set_config('simo.id_usuario', '<id>', true);
--     SELECT set_config('simo.motivo', '<texto>', true);   -- opcional
-- El tercer parámetro (true) limita el valor a la transacción actual.
-- =====================================================================

BEGIN;

-- Zona horaria de Colombia para toda la base (fechas de ventas, Kardex, etc.)
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Bogota');
END
$$;

-- ---------------------------------------------------------------------
-- Actualiza actualizado_en en cada UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Usuario responsable de la transacción en curso (NULL si no se definió)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_usuario_sesion()
RETURNS INTEGER AS $$
    SELECT NULLIF(current_setting('simo.id_usuario', true), '')::INTEGER;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Rechaza UPDATE / DELETE / TRUNCATE sobre tablas de solo inserción
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bloquear_modificacion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es inalterable: no se permite % sobre sus registros',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

COMMIT;
