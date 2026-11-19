-- =====================================================================
-- SIMO - Pruebas de integridad del historial (SCRUM-174, migración 026)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/012_integridad.sql
--
-- Parte 1 revisa la ESTRUCTURA (catálogo de PostgreSQL): falla si alguien
-- agrega después una llave con CASCADE hacia el historial o le devuelve a la
-- API el permiso de borrar. Parte 2 intenta borrar y alterar historial real.
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

-- ============================ Parte 1: estructura ============================
-- Llaves hacia ventas, clientes y productos con su acción al borrar
CREATE TEMP TABLE llaves AS
SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna, c.confrelid::regclass::text AS referencia, c.confdeltype AS al_borrar
FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace;

SELECT pg_temp.verificar('Toda llave hacia ventas, clientes o productos es ON DELETE RESTRICT',
    (SELECT count(*) > 0 AND bool_and(al_borrar = 'r') FROM llaves WHERE referencia IN ('ventas', 'clientes', 'productos')));
SELECT pg_temp.verificar('Toda llave hacia usuarios, pedidos y compras es RESTRICT (el historial no se pierde)',
    (SELECT bool_and(al_borrar = 'r') FROM llaves WHERE referencia IN ('usuarios', 'pedidos', 'compras')
        AND (tabla, columna) NOT IN (('detalles_pedidos', 'id_pedido'), ('detalles_compras', 'id_compra'))));
SELECT pg_temp.verificar('Las únicas CASCADE son las líneas de pedido y de compra (documentos que no se pueden borrar)',
    (SELECT array_agg(tabla || '.' || columna ORDER BY tabla) FROM llaves WHERE al_borrar = 'c')
        = ARRAY['detalles_compras.id_compra', 'detalles_pedidos.id_pedido']);
SELECT pg_temp.verificar('Ninguna llave usa SET NULL ni SET DEFAULT (no se pierde a quién pertenece un registro)',
    NOT EXISTS (SELECT 1 FROM llaves WHERE al_borrar IN ('n', 'd')));

-- Protecciones contra UPDATE/DELETE en las tablas de historial
SELECT pg_temp.verificar('Kardex, líneas de venta, ventas, historial de pedidos, auditoría y pagos tienen su protección',
    (SELECT count(DISTINCT tgrelid::regclass::text) = 6 FROM pg_trigger
     WHERE NOT tgisinternal AND tgname IN ('trg_movimientos_inalterable', 'trg_detalles_ventas_inalterable', 'trg_ventas_inalterable',
                                            'trg_historial_pedido_inalterable', 'trg_auditoria_inalterable', 'trg_pagos_digitales_no_se_borran')));

-- Permisos del rol de la API (si existe en esta base)
DO $$
DECLARE
    tabla TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'simo_app') THEN
        RAISE NOTICE 'OK   (sin rol simo_app en esta base: se omite la revisión de permisos)';
        RETURN;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['ventas', 'detalles_ventas', 'pagos_digitales', 'clientes', 'productos', 'categorias',
                                 'pedidos', 'detalles_pedidos', 'compras', 'detalles_compras', 'proveedores', 'empresa',
                                 'movimientos_inventario', 'historial_estados_pedido', 'log_auditoria'] LOOP
        IF has_table_privilege('simo_app', 'public.' || tabla, 'DELETE') THEN
            RAISE EXCEPTION 'FALLA el rol de la API puede borrar en %', tabla;
        END IF;
    END LOOP;
    IF has_table_privilege('simo_app', 'public.detalles_ventas', 'UPDATE') THEN
        RAISE EXCEPTION 'FALLA el rol de la API puede modificar líneas de venta';
    END IF;
    RAISE NOTICE 'OK   El rol de la API no puede borrar en ninguna tabla con historial';
END $$;

-- ============================ Parte 2: historial real ============================
CREATE TEMP TABLE ref AS
SELECT (SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor')   AS u_ven,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'gerente')    AS u_ger,
       (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'EFECTIVO') AS efectivo,
       (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'NEQUI') AS nequi;
SELECT set_config('simo.id_usuario', (SELECT u_ven::TEXT FROM ref), true);

INSERT INTO clientes (id_cliente, identificacion, nombre) VALUES (9003001, '9003001', 'Cliente con historial'), (9003002, '9003002', 'Cliente sin historial');
INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90901, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'), 'INT-1', 'Producto con historial', 100, 200),
       (90902, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'), 'INT-2', 'Producto sin historial', 100, 200);
SELECT fn_registrar_ingreso_bodega(90901, 10, u_inv) FROM ref;
CREATE TEMP TABLE v1 AS SELECT * FROM fn_registrar_venta((SELECT u_ven FROM ref), (SELECT efectivo FROM ref), '[{"id_producto": 90901, "cantidad": 2}]', 9003001);
CREATE TEMP TABLE v2 AS SELECT * FROM fn_registrar_venta((SELECT u_ven FROM ref), (SELECT nequi FROM ref), '[{"id_producto": 90901, "cantidad": 1}]', NULL, 0, 'REF-INT');
-- Venta que viene de un pedido: no tiene movimientos propios en el Kardex
INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada) SELECT 9003010, 9003001, u_ven, now() + interval '1 day' FROM ref;
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES (9003010, 90901, 1, 200, 200);
SELECT fn_cambiar_estado_pedido(9003010, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
CREATE TEMP TABLE v3 AS SELECT * FROM fn_convertir_pedido_en_venta(9003010, (SELECT u_ven FROM ref), (SELECT efectivo FROM ref));

SELECT pg_temp.verificar('fn_registrar_venta en dos fases: la venta nace con sus totales y el Kardex cuadra',
    (SELECT subtotal = 400 AND total = 400 FROM v1) AND (SELECT consistente FROM fn_validar_kardex(90901)));

-- Producto y cliente con historial no se borran; sin historial, sí
SELECT pg_temp.debe_fallar('No se borra un producto con movimientos', '23001', 'DELETE FROM productos WHERE id_producto = 90901');
SELECT pg_temp.debe_fallar('No se borra un cliente con ventas y pedidos', '23001', 'DELETE FROM clientes WHERE id_cliente = 9003001');
DELETE FROM productos WHERE id_producto = 90902;
DELETE FROM clientes WHERE id_cliente = 9003002;
SELECT pg_temp.verificar('Un producto o un cliente sin historial sí se pueden borrar (error de digitación)',
    NOT EXISTS (SELECT 1 FROM productos WHERE id_producto = 90902) AND NOT EXISTS (SELECT 1 FROM clientes WHERE id_cliente = 9003002));

-- Ventas
SELECT pg_temp.debe_fallar('No se borra una venta', 'SM034', format('DELETE FROM ventas WHERE id_venta = %s', (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('No se borra una venta que viene de un pedido (sin Kardex propio)', 'SM034',
    format('DELETE FROM ventas WHERE id_venta = %s', (SELECT id_venta FROM v3)));
SELECT pg_temp.debe_fallar('No se borran las líneas de una venta', '42501',
    format('DELETE FROM detalles_ventas WHERE id_venta = %s', (SELECT id_venta FROM v3)));
SELECT pg_temp.debe_fallar('No se modifican las líneas de una venta', '42501',
    format('UPDATE detalles_ventas SET cantidad = 1, subtotal_linea = 200 WHERE id_venta = %s', (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('No se cambia el total de una venta', 'SM034',
    format('UPDATE ventas SET descuento = 100, total = 300 WHERE id_venta = %s', (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('No se cambia el cliente ni el método de pago de una venta', 'SM034',
    format('UPDATE ventas SET id_cliente = NULL WHERE id_venta = %s', (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('No se vacía la tabla de ventas', '42501', 'TRUNCATE ventas CASCADE');

SELECT fn_anular_venta((SELECT id_venta FROM v1), u_ven, u_ger, 'Devolución del cliente') FROM ref;
SELECT pg_temp.verificar('La anulación sigue funcionando y devuelve el stock',
    (SELECT estado = 'ANULADA' FROM ventas WHERE id_venta = (SELECT id_venta FROM v1))
    AND (SELECT consistente FROM fn_validar_kardex(90901)));
SELECT pg_temp.debe_fallar('Una venta anulada no se "desanula"', 'SM034',
    format($q$UPDATE ventas SET estado = 'COMPLETADA', anulada_en = NULL, anulada_por = NULL, autorizada_por = NULL, motivo_anulacion = NULL
              WHERE id_venta = %s$q$, (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('No se cambia el motivo de una anulación ya hecha', 'SM034',
    format($q$UPDATE ventas SET motivo_anulacion = 'Otro motivo' WHERE id_venta = %s$q$, (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('La anulación no puede cambiar otros datos de la venta', 'SM034',
    format($q$UPDATE ventas SET estado = 'ANULADA', anulada_en = now(), anulada_por = %s, autorizada_por = %s,
              motivo_anulacion = 'x', total = 0, subtotal = 0 WHERE id_venta = %s$q$,
           (SELECT u_ven FROM ref), (SELECT u_ger FROM ref), (SELECT id_venta FROM v2)));

-- Pagos digitales
SELECT pg_temp.debe_fallar('No se borra el pago digital de una venta', 'SM034',
    format('DELETE FROM pagos_digitales WHERE id_venta = %s', (SELECT id_venta FROM v2)));
SELECT pg_temp.verificar('El pago digital se sigue pudiendo conciliar',
    (SELECT estado = 'CONCILIADO' FROM fn_conciliar_pago((SELECT id_venta FROM v2), 'CONCILIADO', (SELECT u_ger FROM ref))));

-- Pedidos y compras
-- Lo rechaza el historial (RESTRICT) o la protección de sus líneas (015), según cuál se revise primero
DO $$
BEGIN
    BEGIN
        DELETE FROM pedidos WHERE id_pedido = 9003010;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE NOT IN ('23001', 'SM017') THEN
            RAISE EXCEPTION 'FALLA borrar un pedido: error inesperado % (%)', SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE 'OK   No se borra un pedido con historial  [%] %', SQLSTATE, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA el pedido con historial se pudo borrar';
END $$;
SELECT pg_temp.debe_fallar('No se borra el historial de un pedido', '42501', 'DELETE FROM historial_estados_pedido WHERE id_pedido = 9003010');
SELECT pg_temp.debe_fallar('No se borra un movimiento del Kardex', '42501', 'DELETE FROM movimientos_inventario WHERE id_producto = 90901');

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de integridad pasaron'; END $$;

ROLLBACK;
