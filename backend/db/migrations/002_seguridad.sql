-- =====================================================================
-- SIMO - Migración 002: seguridad y administración (SCRUM-84, SCRUM-15)
-- Tablas: roles, usuarios, empresa
-- Requisitos: RF-01, RF-02, RF-03, RF-04, RNF-05 | CU-01, CU-02, CU-03
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- roles (RF-03)
-- Los 4 perfiles del backlog EP5 v1.0 / SRS 2.1. "codigo" es el valor
-- estable que usará el middleware RBAC y el JWT; "nombre" es el texto
-- que se muestra en pantalla.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id_rol      SERIAL PRIMARY KEY,
    codigo      VARCHAR(20)  NOT NULL UNIQUE CHECK (codigo = upper(codigo)),
    nombre      VARCHAR(50)  NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE roles IS 'Perfiles de acceso del sistema (RBAC) - RF-03';
COMMENT ON COLUMN roles.codigo IS 'Identificador estable usado en el JWT y en requireRole(): ADMIN, GERENTE, INVENTARIO, VENDEDOR';

INSERT INTO roles (codigo, nombre, descripcion) VALUES
    ('ADMIN',      'Administrador',           'Gestiona usuarios, roles, datos de la empresa y consulta la auditoría'),
    ('GERENTE',    'Propietario / Gerente',   'Consulta dashboard, rentabilidad y valor del inventario; autoriza anulaciones'),
    ('INVENTARIO', 'Encargado de Inventario', 'Gestiona catálogo, ingresos a bodega, traslados, ajustes y alertas'),
    ('VENDEDOR',   'Vendedor',                'Registra ventas y clientes, gestiona el ciclo de los pedidos')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- usuarios (RF-01, RF-02, RNF-05, CU-01)
-- El login es por correo (CU-01). El correo se guarda siempre en
-- minúsculas para que la unicidad no dependa de mayúsculas.
-- intentos_fallidos / bloqueado_hasta soportan la regla de CU-01:
-- 3 intentos fallidos -> bloqueo temporal de 5 minutos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario        SERIAL PRIMARY KEY,
    id_rol            INTEGER      NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,
    nombre_completo   VARCHAR(150) NOT NULL CHECK (btrim(nombre_completo) <> ''),
    correo            VARCHAR(150) NOT NULL UNIQUE CHECK (correo = lower(btrim(correo))),
    usuario           VARCHAR(50)  NOT NULL UNIQUE CHECK (btrim(usuario) <> ''),
    password_hash     VARCHAR(255) NOT NULL,
    estado            BOOLEAN      NOT NULL DEFAULT TRUE,
    intentos_fallidos SMALLINT     NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
    bloqueado_hasta   TIMESTAMPTZ,
    ultimo_acceso     TIMESTAMPTZ,
    creado_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE usuarios IS 'Usuarios del sistema con rol asignado - RF-01, RF-02';
COMMENT ON COLUMN usuarios.password_hash IS 'Hash bcrypt (RNF-05). Nunca se devuelve en las respuestas de la API';
COMMENT ON COLUMN usuarios.estado IS 'TRUE = activo, FALSE = inactivo (RF-02). Un usuario inactivo no puede iniciar sesión (CU-01 E-04)';
COMMENT ON COLUMN usuarios.bloqueado_hasta IS 'Bloqueo temporal tras intentos fallidos (CU-01, regla opcional recomendada)';

CREATE INDEX IF NOT EXISTS idx_usuarios_id_rol ON usuarios(id_rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios(estado);

DROP TRIGGER IF EXISTS trg_usuarios_actualizado_en ON usuarios;
CREATE TRIGGER trg_usuarios_actualizado_en
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- ---------------------------------------------------------------------
-- empresa (RF-04, CU-03)
-- Registro único: la fila con id_empresa = 1 guarda los datos que se
-- muestran en el Navbar y en el encabezado de los reportes PDF.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresa (
    id_empresa     SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id_empresa = 1),
    razon_social   VARCHAR(150) NOT NULL CHECK (btrim(razon_social) <> ''),
    nit            VARCHAR(20)  NOT NULL CHECK (btrim(nit) <> ''),
    telefono       VARCHAR(30),
    direccion      VARCHAR(200),
    logo_url       VARCHAR(500),
    actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE empresa IS 'Datos básicos de la empresa, registro único (RF-04)';

DROP TRIGGER IF EXISTS trg_empresa_actualizado_en ON empresa;
CREATE TRIGGER trg_empresa_actualizado_en
    BEFORE UPDATE ON empresa
    FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

COMMIT;
