-- =====================================================================
-- SIMO - Pruebas de compras y sp_confirmar_compra (SCRUM-45)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/003_compras.sql
-- =====================================================================

BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(prueba TEXT, codigo TEXT, sentencia TEXT) RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE sentencia;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> codigo THEN
            RAISE EXCEPTION 'FALLA % : se esperaba % y llegó % (%)', prueba, codigo, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE 'OK   %  [%] %', prueba, SQLSTATE, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA % : la sentencia debía ser rechazada', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.verificar(prueba TEXT, condicion BOOLEAN) RETURNS VOID AS $$
BEGIN
    IF condicion IS NOT TRUE THEN RAISE EXCEPTION 'FALLA %', prueba; END IF;
    RAISE NOTICE 'OK   %', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE ref AS
SELECT (SELECT id_producto FROM productos WHERE sku = 'ELEC-001') AS p_und,
       (SELECT id_producto FROM productos WHERE sku = 'FERR-001') AS p_kg,
       (SELECT id_producto FROM productos WHERE sku = 'ELEC-002') AS p_otro,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv,
       (SELECT min(id_proveedor) FROM proveedores) AS prov,
       (SELECT stock_bodega FROM productos WHERE sku = 'ELEC-001') AS und_ini,
       (SELECT stock_bodega FROM productos WHERE sku = 'FERR-001') AS kg_ini,
       (SELECT stock_bodega FROM productos WHERE sku = 'ELEC-002') AS otro_ini;

-- ------------------------------ Confirmación correcta ------------------------------
INSERT INTO compras (id_compra, id_proveedor, documento_referencia, id_usuario)
SELECT 9001, prov, 'FAC-9001', u_inv FROM ref;
INSERT INTO detalles_compras (id_compra, id_producto, cantidad, costo_unitario)
SELECT 9001, p_und, 10, 50000 FROM ref UNION ALL
SELECT 9001, p_kg, 2.5, 8000 FROM ref;

SELECT pg_temp.verificar('El total de la compra se calcula con sus líneas',
    (SELECT total = 10 * 50000 + 2.5 * 8000 FROM compras WHERE id_compra = 9001));

DO $$ BEGIN EXECUTE format('CALL sp_confirmar_compra(9001, %s)', (SELECT u_inv FROM ref)); END $$;

SELECT pg_temp.verificar('La compra queda CONFIRMADA con usuario y fecha',
    (SELECT estado = 'CONFIRMADA' AND confirmada_por = ref.u_inv AND confirmada_en IS NOT NULL FROM compras, ref WHERE id_compra = 9001));
SELECT pg_temp.verificar('Cada línea suma solo a Bodega',
    (SELECT (SELECT stock_bodega FROM productos WHERE id_producto = ref.p_und) = ref.und_ini + 10
        AND (SELECT stock_bodega FROM productos WHERE id_producto = ref.p_kg) = ref.kg_ini + 2.5 FROM ref));
SELECT pg_temp.verificar('Se genera un movimiento ENTRADA_COMPRA por línea, enlazado a la compra',
    (SELECT count(*) = 2 AND bool_and(tipo_movimiento = 'ENTRADA_COMPRA' AND documento_referencia = 'FAC-9001')
     FROM movimientos_inventario WHERE id_compra = 9001));
SELECT pg_temp.verificar('Los movimientos usan el costo de la línea de compra',
    (SELECT costo_unitario = 50000 FROM movimientos_inventario m, ref WHERE m.id_compra = 9001 AND m.id_producto = ref.p_und));

-- ------------------------------ Compra confirmada inalterable ------------------------------
SELECT pg_temp.debe_fallar('No se confirma dos veces', 'SM011',
    format('CALL sp_confirmar_compra(9001, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('No se agregan líneas a una compra confirmada', 'SM010',
    format('INSERT INTO detalles_compras (id_compra, id_producto, cantidad, costo_unitario) VALUES (9001, %s, 1, 1)', p_otro)) FROM ref;
SELECT pg_temp.debe_fallar('No se modifican líneas de una compra confirmada', 'SM010',
    'UPDATE detalles_compras SET cantidad = 99 WHERE id_compra = 9001');
SELECT pg_temp.debe_fallar('No se borran líneas de una compra confirmada', 'SM010',
    'DELETE FROM detalles_compras WHERE id_compra = 9001');
SELECT pg_temp.debe_fallar('No se cambia el documento de una compra confirmada', 'SM011',
    'UPDATE compras SET documento_referencia = ''OTRA'' WHERE id_compra = 9001');
SELECT pg_temp.debe_fallar('No vuelve a BORRADOR', 'SM011',
    'UPDATE compras SET estado = ''BORRADOR'', confirmada_por = NULL, confirmada_en = NULL WHERE id_compra = 9001');

-- ------------------------------ Validaciones ------------------------------
SELECT pg_temp.debe_fallar('Compra inexistente', 'SM012',
    format('CALL sp_confirmar_compra(999999, %s)', u_inv)) FROM ref;
INSERT INTO compras (id_compra, id_usuario) SELECT 9002, u_inv FROM ref;
SELECT pg_temp.debe_fallar('Compra sin líneas', 'SM013',
    format('CALL sp_confirmar_compra(9002, %s)', u_inv)) FROM ref;
SELECT pg_temp.verificar('Una compra sin líneas sigue en BORRADOR',
    (SELECT estado = 'BORRADOR' FROM compras WHERE id_compra = 9002));

-- ------------------------------ Atomicidad ------------------------------
INSERT INTO compras (id_compra, id_usuario) SELECT 9003, u_inv FROM ref;
INSERT INTO detalles_compras (id_compra, id_producto, cantidad, costo_unitario)
SELECT 9003, p_otro, 5, 1000 FROM ref UNION ALL
SELECT 9003, p_und, 1.5, 1000 FROM ref;   -- cantidad decimal en producto por unidad: falla
SELECT pg_temp.debe_fallar('Una línea inválida hace fallar toda la compra', 'SM004',
    format('CALL sp_confirmar_compra(9003, %s)', u_inv)) FROM ref;
SELECT pg_temp.verificar('Si falla una línea, no se aplica ninguna',
    (SELECT (SELECT stock_bodega FROM productos WHERE id_producto = ref.p_otro) = ref.otro_ini
        AND NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE id_compra = 9003)
        AND (SELECT estado FROM compras WHERE id_compra = 9003) = 'BORRADOR' FROM ref));

SELECT pg_temp.debe_fallar('El enlace a compra solo se permite en entradas por compra', '23514',
    format($q$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad,
        costo_unitario, saldo_bodega, saldo_almacen, id_usuario, motivo, id_compra)
        VALUES (%s, 'AJUSTE_POSITIVO', 'BODEGA', 1, 1, 1, 0, %s, 'x', 9001)$q$, p_und, u_inv)) FROM ref;

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de compras pasaron'; END $$;

ROLLBACK;
