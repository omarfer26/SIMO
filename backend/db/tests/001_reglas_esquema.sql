-- =====================================================================
-- SIMO - Pruebas de reglas del esquema (SCRUM-84)
-- Requiere las migraciones y el seed de desarrollo.
-- Todo corre dentro de una transacción que se revierte al final: no deja
-- datos en la base. Si una regla falla, la ejecución se detiene con error.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/001_reglas_esquema.sql
-- =====================================================================

BEGIN;

-- Espera que la sentencia falle; si se ejecuta sin error, la prueba falla.
CREATE FUNCTION pg_temp.debe_fallar(prueba TEXT, sentencia TEXT) RETURNS VOID AS $$
BEGIN
    BEGIN
        EXECUTE sentencia;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'OK   %  (%)', prueba, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA % : la sentencia debía ser rechazada', prueba;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.debe_pasar(prueba TEXT, sentencia TEXT) RETURNS VOID AS $$
BEGIN
    EXECUTE sentencia;
    RAISE NOTICE 'OK   %', prueba;
END;
$$ LANGUAGE plpgsql;

SELECT set_config('simo.id_usuario', (SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor')::TEXT, true);

-- ------------------------------ Seguridad ------------------------------
SELECT pg_temp.debe_fallar('Correo duplicado',
    $$INSERT INTO usuarios (id_rol, nombre_completo, correo, usuario, password_hash)
      VALUES (1, 'X', 'admin@simo.local', 'otro', 'h')$$);
SELECT pg_temp.debe_fallar('Correo con mayúsculas',
    $$INSERT INTO usuarios (id_rol, nombre_completo, correo, usuario, password_hash)
      VALUES (1, 'X', 'Nuevo@Simo.local', 'nuevo', 'h')$$);
SELECT pg_temp.debe_fallar('Rol inexistente',
    $$INSERT INTO usuarios (id_rol, nombre_completo, correo, usuario, password_hash)
      VALUES (999, 'X', 'x@simo.local', 'x', 'h')$$);
SELECT pg_temp.debe_fallar('Segunda fila en empresa',
    $$INSERT INTO empresa (id_empresa, razon_social, nit) VALUES (2, 'Otra', '1')$$);

-- ------------------------------ Catálogo -------------------------------
SELECT pg_temp.debe_fallar('SKU duplicado (CU-04 EX-1)',
    $$INSERT INTO productos (id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
      VALUES (1, 1, 'ELEC-001', 'Repetido', 1, 2)$$);
SELECT pg_temp.debe_fallar('Stock negativo en Almacén',
    $$UPDATE productos SET stock_almacen = -1 WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('stock_total no editable',
    $$UPDATE productos SET stock_total = 5 WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Borrar categoría con productos',
    $$DELETE FROM categorias WHERE nombre = 'Electrónica'$$);

-- ------------------------------ Inventario -----------------------------
SELECT pg_temp.debe_pasar('Entrada de compra a Bodega',
    $$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad,
          costo_unitario, saldo_bodega, saldo_almacen, id_usuario, id_proveedor)
      SELECT id_producto, 'ENTRADA_COMPRA', 'BODEGA', 10, 58400, 10, 0, 1, 1 FROM productos WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Compra directa al Almacén (CU-05 RB-2)',
    $$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad,
          costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
      SELECT id_producto, 'ENTRADA_COMPRA', 'ALMACEN', 5, 1, 0, 5, 1 FROM productos WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Traslado Almacén -> Bodega',
    $$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
          costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
      SELECT id_producto, 'TRASLADO_INTERNO', 'ALMACEN', 'BODEGA', 1, 1, 1, 0, 1 FROM productos WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Ajuste sin justificación (RF-10)',
    $$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad,
          costo_unitario, saldo_bodega, saldo_almacen, id_usuario, motivo)
      SELECT id_producto, 'AJUSTE_NEGATIVO', 'BODEGA', 1, 1, 9, 0, 1, '   ' FROM productos WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Salida de venta sin venta asociada',
    $$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad,
          costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
      SELECT id_producto, 'SALIDA_VENTA', 'ALMACEN', 1, 1, 0, 0, 1 FROM productos WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Cantidad cero',
    $$INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad,
          costo_unitario, saldo_bodega, saldo_almacen, id_usuario)
      SELECT id_producto, 'ENTRADA_COMPRA', 'BODEGA', 0, 1, 0, 0, 1 FROM productos WHERE sku = 'ELEC-001'$$);
SELECT pg_temp.debe_fallar('Kardex inalterable: UPDATE',
    $$UPDATE movimientos_inventario SET cantidad = 99$$);
SELECT pg_temp.debe_fallar('Kardex inalterable: DELETE',
    $$DELETE FROM movimientos_inventario$$);
SELECT pg_temp.debe_fallar('Kardex inalterable: TRUNCATE',
    $$TRUNCATE movimientos_inventario CASCADE$$);
DO $$
BEGIN
    IF (SELECT entrada_bodega FROM v_kardex WHERE sku = 'ELEC-001') <> 10 THEN
        RAISE EXCEPTION 'FALLA v_kardex: la entrada a bodega debía ser 10';
    END IF;
    RAISE NOTICE 'OK   v_kardex muestra la entrada en la columna de Bodega';
END $$;

-- ------------------------------ Ventas ---------------------------------
SELECT pg_temp.debe_fallar('Total que no cuadra',
    $$INSERT INTO ventas (id_usuario, id_metodo_pago, subtotal, descuento, impuestos, total)
      VALUES (4, 1, 100, 10, 0, 100)$$);
SELECT pg_temp.debe_pasar('Venta completada',
    $$INSERT INTO ventas (id_venta, id_usuario, id_metodo_pago, subtotal, total)
      VALUES (1000, 4, 1, 89900, 89900)$$);
SELECT pg_temp.debe_fallar('Subtotal de línea mal calculado',
    $$INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, costo_unitario, subtotal_linea)
      VALUES (1000, 1, 2, 89900, 58400, 89900)$$);
SELECT pg_temp.debe_fallar('Anulación sin autorizador ni motivo (CU-11)',
    $$UPDATE ventas SET estado = 'ANULADA', anulada_en = now(), anulada_por = 4 WHERE id_venta = 1000$$);
SELECT pg_temp.debe_pasar('Anulación completa',
    $$UPDATE ventas SET estado = 'ANULADA', anulada_en = now(), anulada_por = 4,
          autorizada_por = 2, motivo_anulacion = 'Cliente devolvió el producto' WHERE id_venta = 1000$$);

-- ------------------------------ Pedidos --------------------------------
SELECT pg_temp.debe_fallar('Pedido que no inicia en REGISTRADO',
    $$INSERT INTO pedidos (id_cliente, id_usuario, estado, fecha_entrega_pactada)
      VALUES (1, 4, 'CONFIRMADO', now() + interval '2 days')$$);
SELECT pg_temp.debe_pasar('Pedido registrado',
    $$INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
      VALUES (500, 1, 4, now() + interval '2 days')$$);
SELECT pg_temp.debe_fallar('Saltar de REGISTRADO a LISTO (CU-12 CA-2)',
    $$UPDATE pedidos SET estado = 'LISTO' WHERE id_pedido = 500$$);
SELECT pg_temp.debe_pasar('Avanzar a CONFIRMADO',
    $$UPDATE pedidos SET estado = 'CONFIRMADO' WHERE id_pedido = 500$$);
SELECT pg_temp.debe_fallar('Retroceder a REGISTRADO',
    $$UPDATE pedidos SET estado = 'REGISTRADO' WHERE id_pedido = 500$$);
SELECT pg_temp.debe_fallar('Cancelar sin motivo (CU-13 EX-2)',
    $$UPDATE pedidos SET estado = 'CANCELADO' WHERE id_pedido = 500$$);
SELECT set_config('simo.motivo', 'El cliente desistió de la compra', true);
SELECT pg_temp.debe_pasar('Cancelar con motivo',
    $$UPDATE pedidos SET estado = 'CANCELADO' WHERE id_pedido = 500$$);
SELECT set_config('simo.motivo', '', true);
SELECT pg_temp.debe_fallar('Reabrir pedido cancelado',
    $$UPDATE pedidos SET estado = 'CONFIRMADO' WHERE id_pedido = 500$$);
DO $$
DECLARE n INTEGER;
BEGIN
    SELECT count(*) INTO n FROM historial_estados_pedido WHERE id_pedido = 500;
    IF n <> 3 THEN
        RAISE EXCEPTION 'FALLA historial: se esperaban 3 registros y hay %', n;
    END IF;
    RAISE NOTICE 'OK   Historial registra REGISTRADO, CONFIRMADO y CANCELADO con su usuario';
END $$;
SELECT pg_temp.debe_fallar('Historial de pedido inalterable',
    $$DELETE FROM historial_estados_pedido WHERE id_pedido = 500$$);
SELECT set_config('simo.id_usuario', '', true);
SELECT pg_temp.debe_fallar('Pedido sin usuario de sesión',
    $$INSERT INTO pedidos (id_cliente, id_usuario, fecha_entrega_pactada) VALUES (1, 4, now() + interval '1 day')$$);
SELECT set_config('simo.id_usuario', '4', true);
SELECT pg_temp.debe_pasar('Un pedido genera una sola venta: primera',
    $$INSERT INTO ventas (id_usuario, id_pedido, id_metodo_pago) VALUES (4, 500, 1)$$);
SELECT pg_temp.debe_fallar('Un pedido genera una sola venta: segunda',
    $$INSERT INTO ventas (id_usuario, id_pedido, id_metodo_pago) VALUES (4, 500, 1)$$);

-- ------------------------------ Auditoría ------------------------------
SELECT pg_temp.debe_fallar('Ajuste auditado sin justificación',
    $$INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad) VALUES (3, 'AJUSTE_INVENTARIO', 'productos', 1)$$);
SELECT pg_temp.debe_fallar('Anulación auditada sin autorizador',
    $$INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, justificacion)
      VALUES (4, 'ANULACION_VENTA', 'ventas', 1000, 'Motivo')$$);
SELECT pg_temp.debe_pasar('Registro de auditoría válido',
    $$INSERT INTO log_auditoria (id_usuario, id_usuario_autorizador, accion, entidad, id_entidad, justificacion, datos_anteriores, datos_nuevos)
      VALUES (4, 2, 'ANULACION_VENTA', 'ventas', 1000, 'Cliente devolvió el producto',
              '{"estado":"COMPLETADA"}', '{"estado":"ANULADA"}')$$);
SELECT pg_temp.debe_fallar('Auditoría inalterable: UPDATE',
    $$UPDATE log_auditoria SET justificacion = 'otra'$$);
SELECT pg_temp.debe_fallar('Auditoría inalterable: DELETE',
    $$DELETE FROM log_auditoria$$);
SELECT pg_temp.debe_fallar('Auditoría inalterable: TRUNCATE',
    $$TRUNCATE log_auditoria$$);

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas del esquema pasaron'; END $$;

ROLLBACK;
