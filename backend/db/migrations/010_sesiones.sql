-- =====================================================================
-- SIMO - Migración 010: cierre de sesión con lista de tokens invalidados
-- (SCRUM-17 / SCRUM-18)
--
-- POST /api/auth/logout guarda aquí el token que se cierra y el middleware
-- de autenticación rechaza cualquier token que esté en esta tabla aunque
-- todavía no haya expirado.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS jwt_blacklist (
    token         TEXT        PRIMARY KEY,
    invalidado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE jwt_blacklist IS 'Tokens JWT invalidados por cierre de sesión (SCRUM-17)';

COMMIT;
