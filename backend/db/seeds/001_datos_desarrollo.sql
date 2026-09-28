-- =====================================================================
-- SIMO - Datos de DESARROLLO (no ejecutar en producción)
-- Crea un usuario por rol, la empresa, categorías y productos de ejemplo
-- (mismas categorías que usa el frontend en components/catalogo/tipos.ts).
--
-- Contraseña de todos los usuarios de prueba: Simo2026*
-- Los productos arrancan con stock 0: el stock solo entra por
-- movimientos_inventario (ingreso a Bodega, SCRUM-45 / HU-05).
-- =====================================================================

BEGIN;

-- Hash bcrypt (10 rondas) de 'Simo2026*', precalculado para no depender
-- de la extensión pgcrypto. Compatible con bcrypt.compare de Node.
INSERT INTO usuarios (id_rol, nombre_completo, correo, usuario, password_hash)
SELECT r.id_rol, v.nombre, v.correo, v.usuario,
       '$2b$10$tGHr/PEI4/ihCA5heOG0ze/WSJKVNoQ36zu.4Il9DyCSNda8XGHaa'
FROM (VALUES
    ('ADMIN',      'Administrador SIMO',   'admin@simo.local',      'admin'),
    ('GERENTE',    'Gerente SIMO',         'gerente@simo.local',    'gerente'),
    ('INVENTARIO', 'Encargado Inventario', 'inventario@simo.local', 'inventario'),
    ('VENDEDOR',   'Vendedor SIMO',        'vendedor@simo.local',   'vendedor')
) AS v(rol, nombre, correo, usuario)
JOIN roles r ON r.codigo = v.rol
ON CONFLICT (correo) DO NOTHING;

INSERT INTO empresa (id_empresa, razon_social, nit, telefono, direccion)
VALUES (1, 'Comercial SIMO S.A.S.', '900123456-7', '6075555555', 'Av. 0 # 11-11, Cúcuta')
ON CONFLICT (id_empresa) DO NOTHING;

INSERT INTO categorias (nombre, descripcion) VALUES
    ('Electrónica', 'Accesorios y dispositivos electrónicos'),
    ('Ropa',        'Prendas de vestir'),
    ('Ferretería',  'Herramientas y materiales'),
    ('Papelería',   'Útiles de oficina y escolares'),
    ('Hogar',       'Artículos para el hogar')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO productos (id_categoria, id_unidad, sku, nombre, descripcion,
                       precio_compra, precio_venta, stock_minimo_bodega, stock_minimo_almacen)
SELECT c.id_categoria, u.id_unidad, v.sku, v.nombre, v.descripcion,
       v.precio_compra, v.precio_venta, v.min_bodega, v.min_almacen
FROM (VALUES
    ('ELEC-001', 'Electrónica', 'und', 'Audífonos Bluetooth X200', 'Audífonos inalámbricos con estuche de carga', 58400, 89900, 10, 5),
    ('ELEC-002', 'Electrónica', 'und', 'Cargador USB-C 20W',       'Cargador rápido para celular',                22800, 35000, 20, 10),
    ('FERR-001', 'Ferretería',  'kg',  'Puntilla 2 pulgadas',      'Puntilla de acero vendida por kilo',          9000,  14000, 25, 5),
    ('HOGA-001', 'Hogar',       'L',   'Desinfectante multiusos',  'Desinfectante a granel por litro',            4500,  8000,  40, 10)
) AS v(sku, categoria, unidad, nombre, descripcion, precio_compra, precio_venta, min_bodega, min_almacen)
JOIN categorias c ON c.nombre = v.categoria
JOIN unidades_medida u ON u.abreviatura = v.unidad
ON CONFLICT (sku) DO NOTHING;

INSERT INTO clientes (identificacion, nombre, telefono, correo, direccion) VALUES
    ('1090123456', 'Cliente de Prueba', '3001234567', 'cliente@correo.com', 'Calle 10 # 5-20, Cúcuta')
ON CONFLICT (identificacion) DO NOTHING;

INSERT INTO proveedores (nit, nombre, telefono) VALUES
    ('800111222-3', 'Distribuidora de Prueba', '6075551234')
ON CONFLICT (nit) DO NOTHING;

COMMIT;
