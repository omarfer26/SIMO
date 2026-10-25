-- =====================================================================
-- SIMO - Preparación de Neon para el esquema consolidado (19/10/2026)
--
-- La base de Neon tenía un esquema distinto al del repositorio
-- (backend/db/migrations), creado durante el Sprint 1: personas, permisos,
-- rol_permisos, reservas_stock, detalles_reserva, detalles_venta, kardex y
-- versiones diferentes de usuarios, roles, productos, ventas, categorias y
-- movimientos_inventario. Con esas tablas ocupando los mismos nombres, las
-- migraciones del repositorio no se pueden aplicar.
--
-- Este script NO borra nada: mueve esas 13 tablas (con sus datos, índices y
-- llaves) al esquema respaldo_sprint1, dentro de la misma base. Después se
-- aplican las migraciones del repositorio en public.
--
-- Para consultarlas:  SELECT * FROM respaldo_sprint1.personas;
-- Para revertir:      ALTER TABLE respaldo_sprint1.<tabla> SET SCHEMA public;
--                     (después de retirar las tablas homónimas de public)
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS respaldo_sprint1;
COMMENT ON SCHEMA respaldo_sprint1 IS
    'Tablas del esquema anterior de Neon (Sprint 1), conservadas al aplicar el esquema consolidado el 2026-10-19';

DO $$
DECLARE
    t TEXT;
BEGIN
    -- Solo actúa sobre el esquema ANTERIOR: su tabla usuarios no tiene la
    -- columna nombre_completo. Si ya se migró, no hace nada (se puede re-ejecutar).
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usuarios')
       OR EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'nombre_completo') THEN
        RAISE NOTICE 'public ya no tiene el esquema anterior: no se mueve nada';
        RETURN;
    END IF;

    FOREACH t IN ARRAY ARRAY[
        'categorias', 'detalles_reserva', 'detalles_venta', 'kardex', 'movimientos_inventario',
        'permisos', 'personas', 'productos', 'reservas_stock', 'rol_permisos', 'roles',
        'usuarios', 'ventas'
    ] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I SET SCHEMA respaldo_sprint1', t);
            RAISE NOTICE 'movida: % -> respaldo_sprint1', t;
        END IF;
    END LOOP;
END
$$;

COMMIT;
