-- =====================================================================
-- SIMO - Pruebas de fn_registrar_ingreso_bodega (SCRUM-94 / HU-05)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte al
-- final: no deja datos en la base.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/002_ingreso_bodega.sql
-- =====================================================================

BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(prueba TEXT, codigo TEXT, sentencia TEXT) RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE sentencia;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> codigo THEN
            RAISE EXCEPTION 'FALLA % : se esperaba el código % y llegó % (%)', prueba, codigo, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE 'OK   %  [%] %', prueba, SQLSTATE, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA % : la sentencia debía ser rechazada', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.verificar(prueba TEXT, condicion BOOLEAN) RETURNS VOID AS $$
BEGIN
    IF condicion IS NOT TRUE THEN
        RAISE EXCEPTION 'FALLA %', prueba;
    END IF;
    RAISE NOTICE 'OK   %', prueba;
END;
$$ LANGUAGE plpgsql;

-- Referencias a los datos del seed
CREATE TEMP TABLE ref AS
SELECT (SELECT id_producto FROM productos WHERE sku = 'ELEC-001')                   AS p_und,
       (SELECT id_producto FROM productos WHERE sku = 'FERR-001')                   AS p_kg,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario')               AS u_inv,
       (SELECT id_proveedor FROM proveedores WHERE nit = '800111222-3')             AS prov,
       (SELECT stock_bodega FROM productos WHERE sku = 'ELEC-001')                  AS bodega_ini,
       (SELECT stock_almacen FROM productos WHERE sku = 'ELEC-001')                 AS almacen_ini;

-- ------------------------------ Caso de éxito (CU-05 CA-1) ------------------------------
CREATE TEMP TABLE mov AS
SELECT m.* FROM ref, fn_registrar_ingreso_bodega(ref.p_und, 10, ref.u_inv, NULL, ref.prov, 'FAC-001', 'Compra inicial') m;

SELECT pg_temp.verificar('El movimiento es ENTRADA_COMPRA con destino BODEGA',
    (SELECT tipo_movimiento = 'ENTRADA_COMPRA' AND ubicacion_destino = 'BODEGA' AND ubicacion_origen IS NULL FROM mov));
SELECT pg_temp.verificar('stock_bodega aumenta exactamente en la cantidad ingresada',
    (SELECT p.stock_bodega = ref.bodega_ini + 10 FROM productos p, ref WHERE p.id_producto = ref.p_und));
SELECT pg_temp.verificar('stock_almacen no cambia (CU-05 RB-2)',
    (SELECT p.stock_almacen = ref.almacen_ini FROM productos p, ref WHERE p.id_producto = ref.p_und));
SELECT pg_temp.verificar('El movimiento guarda los saldos resultantes',
    (SELECT mov.saldo_bodega = p.stock_bodega AND mov.saldo_almacen = p.stock_almacen FROM mov, productos p, ref WHERE p.id_producto = ref.p_und));
SELECT pg_temp.verificar('Sin costo indicado se usa el precio de compra del producto',
    (SELECT mov.costo_unitario = p.precio_compra FROM mov, productos p, ref WHERE p.id_producto = ref.p_und));
SELECT pg_temp.verificar('Registra usuario, proveedor y documento',
    (SELECT mov.id_usuario = ref.u_inv AND mov.id_proveedor = ref.prov AND mov.documento_referencia = 'FAC-001' FROM mov, ref));
SELECT pg_temp.verificar('El ingreso aparece en el Kardex como entrada a Bodega',
    (SELECT k.entrada_bodega = 10 AND k.entrada_almacen = 0 AND k.salida_bodega = 0 FROM v_kardex k, mov WHERE k.id_movimiento = mov.id_movimiento));

-- Segundo ingreso: los saldos se acumulan y se respeta el costo indicado
SELECT pg_temp.verificar('Un segundo ingreso acumula el saldo y respeta el costo indicado',
    (SELECT m.saldo_bodega = ref.bodega_ini + 15 AND m.costo_unitario = 60000
       FROM ref, fn_registrar_ingreso_bodega(ref.p_und, 5, ref.u_inv, 60000) m));

-- Producto por kilo: admite decimales
SELECT pg_temp.verificar('Un producto por kilo admite cantidad decimal',
    (SELECT m.cantidad = 2.5 FROM ref, fn_registrar_ingreso_bodega(ref.p_kg, 2.5, ref.u_inv) m));

-- ------------------------------ Validaciones ------------------------------
SELECT pg_temp.debe_fallar('Cantidad cero (CU-05 EX-1)', 'SM003',
    format('SELECT fn_registrar_ingreso_bodega(%s, 0, %s)', p_und, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Cantidad negativa', 'SM003',
    format('SELECT fn_registrar_ingreso_bodega(%s, -3, %s)', p_und, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Cantidad decimal en producto por unidad', 'SM004',
    format('SELECT fn_registrar_ingreso_bodega(%s, 1.5, %s)', p_und, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Producto inexistente', 'SM001',
    format('SELECT fn_registrar_ingreso_bodega(999999, 1, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Usuario inexistente', 'SM005',
    format('SELECT fn_registrar_ingreso_bodega(%s, 1, 999999)', p_und)) FROM ref;
SELECT pg_temp.debe_fallar('Proveedor inexistente', 'SM006',
    format('SELECT fn_registrar_ingreso_bodega(%s, 1, %s, NULL, 999999)', p_und, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Costo unitario negativo', 'SM007',
    format('SELECT fn_registrar_ingreso_bodega(%s, 1, %s, -1)', p_und, u_inv)) FROM ref;

UPDATE productos SET estado = FALSE WHERE id_producto = (SELECT p_kg FROM ref);
SELECT pg_temp.debe_fallar('Producto inactivo', 'SM002',
    format('SELECT fn_registrar_ingreso_bodega(%s, 1, %s)', p_kg, u_inv)) FROM ref;

UPDATE usuarios SET estado = FALSE WHERE id_usuario = (SELECT u_inv FROM ref);
SELECT pg_temp.debe_fallar('Usuario inactivo', 'SM005',
    format('SELECT fn_registrar_ingreso_bodega(%s, 1, %s)', p_und, u_inv)) FROM ref;

SELECT pg_temp.verificar('Un ingreso rechazado no modifica el stock',
    (SELECT p.stock_bodega = ref.bodega_ini + 15 FROM productos p, ref WHERE p.id_producto = ref.p_und));

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de ingreso a Bodega pasaron'; END $$;

ROLLBACK;
