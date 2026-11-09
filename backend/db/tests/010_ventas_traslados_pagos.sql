-- =====================================================================
-- SIMO - Pruebas de venta POS, anulación, traslados, pagos digitales y
-- auditoría de precios (migraciones 020 a 023)
-- Requiere las migraciones y el seed de desarrollo. Todo se revierte.
--
--   psql -v ON_ERROR_STOP=1 -d <base> -f db/tests/010_ventas_traslados_pagos.sql
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
SELECT (SELECT id_usuario FROM usuarios WHERE usuario = 'vendedor')   AS u_ven,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'inventario') AS u_inv,
       (SELECT id_usuario FROM usuarios WHERE usuario = 'gerente')    AS u_ger,
       (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'EFECTIVO') AS efectivo,
       (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'NEQUI')    AS nequi,
       (SELECT min(id_cliente) FROM clientes) AS cliente;
SELECT set_config('simo.id_usuario', (SELECT u_ven::TEXT FROM ref), true);

INSERT INTO productos (id_producto, id_categoria, id_unidad, sku, nombre, precio_compra, precio_venta)
VALUES (90701, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'VTA-1', 'Producto venta uno', 1000, 2500),
       (90702, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'kg'),
        'VTA-2', 'Producto venta kilo', 500, 1200),
       (90703, (SELECT min(id_categoria) FROM categorias), (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und'),
        'VTA-3', 'Producto inactivo', 100, 200);
UPDATE productos SET estado = FALSE WHERE id_producto = 90703;
SELECT fn_registrar_ingreso_bodega(90701, 10, u_inv) FROM ref;
SELECT fn_registrar_ingreso_bodega(90702, 4, u_inv) FROM ref;

-- ============================ Traslados (021) ============================
CREATE TEMP TABLE t1 AS SELECT * FROM fn_registrar_traslado(90701, 3, (SELECT u_inv FROM ref), (SELECT u_ger FROM ref), ' Surtir vitrina ');
SELECT pg_temp.verificar('Traslado: resta de Bodega, suma al Almacén y el total no cambia',
    (SELECT stock_bodega = 7 AND stock_almacen = 3 AND stock_total = 10 FROM productos WHERE id_producto = 90701));
SELECT pg_temp.verificar('Traslado: movimiento TRASLADO_INTERNO con saldos, responsable y motivo',
    (SELECT tipo_movimiento = 'TRASLADO_INTERNO' AND ubicacion_origen = 'BODEGA' AND ubicacion_destino = 'ALMACEN'
            AND saldo_bodega = 7 AND saldo_almacen = 3 AND id_usuario = ref.u_inv AND id_responsable = ref.u_ger
            AND motivo = 'Surtir vitrina' FROM t1, ref));
SELECT pg_temp.verificar('Traslado sin responsable: queda quien lo registra',
    (SELECT id_responsable = ref.u_inv FROM fn_registrar_traslado(90702, 1.5, (SELECT u_inv FROM ref)), ref));
SELECT pg_temp.debe_fallar('Traslado mayor que el stock de Bodega', 'SM014',
    format('SELECT fn_registrar_traslado(90701, 8, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Traslado con cantidad cero', 'SM003', format('SELECT fn_registrar_traslado(90701, 0, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Traslado con decimales en producto por unidad', 'SM004',
    format('SELECT fn_registrar_traslado(90701, 1.5, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Traslado de producto inexistente', 'SM001', format('SELECT fn_registrar_traslado(999999, 1, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Traslado de producto inactivo', 'SM002', format('SELECT fn_registrar_traslado(90703, 1, %s)', u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Traslado con responsable inexistente', 'SM005',
    format('SELECT fn_registrar_traslado(90701, 1, %s, 999999)', u_inv)) FROM ref;

-- ============================ Venta POS (020) ============================
-- 90701: Bodega 7, Almacén 3 · 90702: Bodega 2.5, Almacén 1.5
CREATE TEMP TABLE v1 AS
SELECT * FROM fn_registrar_venta((SELECT u_ven FROM ref), (SELECT efectivo FROM ref),
    '[{"id_producto": 90701, "cantidad": 2}, {"id_producto": 90702, "cantidad": 2}, {"id_producto": 90701, "cantidad": 3}]'::jsonb,
    (SELECT cliente FROM ref), 400);
SELECT pg_temp.verificar('Venta: precios del servidor, producto repetido sumado y totales',
    (SELECT subtotal = 5 * 2500 + 2 * 1200 AND descuento = 400 AND impuestos = 0 AND total = 14500
            AND estado = 'COMPLETADA' AND id_cliente = ref.cliente AND id_usuario = ref.u_ven FROM v1, ref)
    AND (SELECT count(*) = 2 FROM detalles_ventas WHERE id_venta = (SELECT id_venta FROM v1)));
SELECT pg_temp.verificar('Venta: cascada, primero el Almacén y el resto de Bodega (RN-02)',
    (SELECT stock_almacen = 0 AND stock_bodega = 5 FROM productos WHERE id_producto = 90701)
    AND (SELECT stock_almacen = 0 AND stock_bodega = 2 FROM productos WHERE id_producto = 90702)
    AND (SELECT array_agg(ubicacion_origen || ':' || trim_scale(cantidad) || ':' || trim_scale(saldo_bodega) || '/' || trim_scale(saldo_almacen) ORDER BY id_movimiento)
         FROM movimientos_inventario WHERE id_venta = (SELECT id_venta FROM v1) AND id_producto = 90701)
        = ARRAY['ALMACEN:3:7/0', 'BODEGA:2:5/0']);
SELECT pg_temp.verificar('Venta: congela el costo de cada línea',
    (SELECT costo_unitario = 1000 FROM detalles_ventas WHERE id_venta = (SELECT id_venta FROM v1) AND id_producto = 90701));
SELECT pg_temp.verificar('Venta en efectivo no crea pago digital',
    NOT EXISTS (SELECT 1 FROM pagos_digitales WHERE id_venta = (SELECT id_venta FROM v1)));
SELECT pg_temp.verificar('El Kardex sigue consistente después de vender',
    (SELECT bool_and(consistente) FROM fn_validar_kardex() WHERE id_producto IN (90701, 90702)));

CREATE TEMP TABLE antes AS SELECT (SELECT count(*) FROM ventas) AS ventas, (SELECT count(*) FROM movimientos_inventario) AS movs;
SELECT pg_temp.debe_fallar('RN-01: no vende más que el stock total', 'SM019',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 90702, "cantidad": 1}, {"id_producto": 90701, "cantidad": 6}]')$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.verificar('Una venta rechazada no deja venta, líneas ni movimientos',
    (SELECT a.ventas = (SELECT count(*) FROM ventas) AND a.movs = (SELECT count(*) FROM movimientos_inventario) FROM antes a)
    AND (SELECT stock_bodega = 2 FROM productos WHERE id_producto = 90702));
SELECT pg_temp.debe_fallar('Venta sin productos', 'SM026', format($q$SELECT fn_registrar_venta(%s, %s, '[]')$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.debe_fallar('Venta con cantidad cero', 'SM003',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 90701, "cantidad": 0}]')$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.debe_fallar('Venta con decimales en producto por unidad', 'SM004',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 90701, "cantidad": 1.5}]')$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.debe_fallar('Venta de producto inexistente', 'SM001',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 999999, "cantidad": 1}]')$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.debe_fallar('Venta de producto inactivo', 'SM002',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 90703, "cantidad": 1}]')$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.debe_fallar('Venta con descuento mayor que el subtotal', 'SM023',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 90701, "cantidad": 1}]', NULL, 2501)$q$, u_ven, efectivo)) FROM ref;
SELECT pg_temp.debe_fallar('Venta con método de pago inexistente', 'SM022',
    format($q$SELECT fn_registrar_venta(%s, 999999, '[{"id_producto": 90701, "cantidad": 1}]')$q$, u_ven)) FROM ref;
SELECT pg_temp.debe_fallar('Venta con cliente inexistente', 'SM025',
    format($q$SELECT fn_registrar_venta(%s, %s, '[{"id_producto": 90701, "cantidad": 1}]', 999999)$q$, u_ven, efectivo)) FROM ref;

-- ============================ Pagos digitales (022) ============================
CREATE TEMP TABLE v2 AS
SELECT * FROM fn_registrar_venta((SELECT u_ven FROM ref), (SELECT nequi FROM ref),
    '[{"id_producto": 90701, "cantidad": 1}]'::jsonb, NULL, 0, '  M1234567 ');
SELECT pg_temp.verificar('Venta con Nequi: guarda la referencia y crea el pago PENDIENTE',
    (SELECT referencia_pago = 'M1234567' FROM v2)
    AND (SELECT estado = 'PENDIENTE' AND referencia = 'M1234567' AND conciliado_por IS NULL
         FROM pagos_digitales WHERE id_venta = (SELECT id_venta FROM v2)));
SELECT pg_temp.debe_fallar('Solo Gerente o Administrador concilian', 'SM030',
    format($q$SELECT fn_conciliar_pago(%s, 'CONCILIADO', %s)$q$, (SELECT id_venta FROM v2), u_ven)) FROM ref;
SELECT pg_temp.debe_fallar('Rechazar exige observación', 'SM015',
    format($q$SELECT fn_conciliar_pago(%s, 'RECHAZADO', %s, ' ')$q$, (SELECT id_venta FROM v2), u_ger)) FROM ref;
SELECT pg_temp.debe_fallar('Estado de conciliación inválido', 'SM032',
    format($q$SELECT fn_conciliar_pago(%s, 'PAGADO', %s)$q$, (SELECT id_venta FROM v2), u_ger)) FROM ref;
SELECT pg_temp.debe_fallar('Venta en efectivo no se concilia', 'SM031',
    format($q$SELECT fn_conciliar_pago(%s, 'CONCILIADO', %s)$q$, (SELECT id_venta FROM v1), u_ger)) FROM ref;
SELECT pg_temp.verificar('Conciliar: queda quién, cuándo y la observación',
    (SELECT estado = 'CONCILIADO' AND conciliado_por = ref.u_ger AND conciliado_en IS NOT NULL AND observacion = 'Llegó a la cuenta'
     FROM fn_conciliar_pago((SELECT id_venta FROM v2), 'CONCILIADO', (SELECT u_ger FROM ref), 'Llegó a la cuenta'), ref));
SELECT pg_temp.verificar('Una conciliación se puede corregir (rechazar con observación y nueva referencia)',
    (SELECT estado = 'RECHAZADO' AND referencia = 'M7654321'
     FROM fn_conciliar_pago((SELECT id_venta FROM v2), 'RECHAZADO', (SELECT u_ger FROM ref), 'No aparece en el extracto', 'M7654321')));
SELECT pg_temp.debe_fallar('El comprobante no admite otros tipos de archivo', '23514',
    format($q$UPDATE pagos_digitales SET comprobante_nombre = 'x.exe', comprobante_tipo = 'application/x-msdownload', comprobante_datos = '\x00' WHERE id_venta = %s$q$, (SELECT id_venta FROM v2)));

-- ============================ Anulación (020, CU-11) ============================
SELECT pg_temp.debe_fallar('Anular exige motivo', 'SM015',
    format($q$SELECT fn_anular_venta(%s, %s, %s, '')$q$, (SELECT id_venta FROM v1), u_ven, u_ger)) FROM ref;
SELECT pg_temp.debe_fallar('El autorizador debe ser Gerente o Administrador', 'SM030',
    format($q$SELECT fn_anular_venta(%s, %s, %s, 'Error de digitación')$q$, (SELECT id_venta FROM v1), u_ven, u_inv)) FROM ref;
SELECT pg_temp.debe_fallar('Venta inexistente', 'SM028',
    format($q$SELECT fn_anular_venta(999999, %s, %s, 'x')$q$, u_ven, u_ger)) FROM ref;

SELECT fn_anular_venta((SELECT id_venta FROM v1), u_ven, u_ger, ' Cliente devolvió la compra ') FROM ref;
SELECT pg_temp.verificar('Anular: la venta queda ANULADA con ejecutor, autorizador y motivo',
    (SELECT estado = 'ANULADA' AND anulada_por = ref.u_ven AND autorizada_por = ref.u_ger AND anulada_en IS NOT NULL
            AND motivo_anulacion = 'Cliente devolvió la compra' FROM ventas, ref WHERE id_venta = (SELECT id_venta FROM v1)));
SELECT pg_temp.verificar('Anular: cada cantidad vuelve a su ubicación de origen',
    (SELECT stock_almacen = 3 AND stock_bodega = 6 FROM productos WHERE id_producto = 90701)   -- 7 - 1 (venta Nequi vigente)
    AND (SELECT stock_almacen = 1.5 AND stock_bodega = 2.5 FROM productos WHERE id_producto = 90702)
    AND (SELECT count(*) = 4 FROM movimientos_inventario WHERE id_venta = (SELECT id_venta FROM v1) AND tipo_movimiento = 'REVERSO_VENTA'));
SELECT pg_temp.verificar('Anular: auditoría con autorizador, motivo y reversión',
    (SELECT id_usuario = ref.u_ven AND id_usuario_autorizador = ref.u_ger AND justificacion = 'Cliente devolvió la compra'
            AND datos_nuevos ->> 'estado' = 'ANULADA' AND jsonb_array_length(datos_nuevos -> 'reversion') = 4
     FROM log_auditoria, ref WHERE accion = 'ANULACION_VENTA' AND id_entidad = (SELECT id_venta FROM v1)));
SELECT pg_temp.debe_fallar('Una venta no se anula dos veces', 'SM029',
    format($q$SELECT fn_anular_venta(%s, %s, %s, 'otra vez')$q$, (SELECT id_venta FROM v1), u_ven, u_ger)) FROM ref;
SELECT pg_temp.verificar('El Kardex queda consistente después de anular',
    (SELECT bool_and(consistente) FROM fn_validar_kardex() WHERE id_producto IN (90701, 90702)));

SELECT fn_anular_venta((SELECT id_venta FROM v2), u_ven, u_ger, 'Pago rechazado') FROM ref;
SELECT pg_temp.debe_fallar('El pago de una venta anulada no se concilia', 'SM032',
    format($q$SELECT fn_conciliar_pago(%s, 'CONCILIADO', %s)$q$, (SELECT id_venta FROM v2), u_ger)) FROM ref;

-- Venta que viene de un pedido: al anularla vuelve lo que descontó el pedido
INSERT INTO pedidos (id_pedido, id_cliente, id_usuario, fecha_entrega_pactada)
SELECT 9001100, cliente, u_ven, now() + interval '1 day' FROM ref;
INSERT INTO detalles_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal_linea) VALUES (9001100, 90701, 4, 2500, 10000);
SELECT fn_cambiar_estado_pedido(9001100, s, u_inv) FROM ref, unnest(ARRAY['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']) s;
CREATE TEMP TABLE v3 AS SELECT * FROM fn_convertir_pedido_en_venta(9001100, (SELECT u_ven FROM ref), (SELECT nequi FROM ref), 0, 'REF-PEDIDO-1');
SELECT pg_temp.verificar('Pedido convertido con Nequi: referencia y pago PENDIENTE',
    (SELECT referencia_pago = 'REF-PEDIDO-1' FROM v3)
    AND (SELECT estado = 'PENDIENTE' AND referencia = 'REF-PEDIDO-1' FROM pagos_digitales WHERE id_venta = (SELECT id_venta FROM v3)));
SELECT pg_temp.verificar('Antes de anular: el pedido dejó Almacén 0 y Bodega 6',
    (SELECT stock_almacen = 0 AND stock_bodega = 6 FROM productos WHERE id_producto = 90701));
SELECT fn_anular_venta((SELECT id_venta FROM v3), u_ven, u_ger, 'Devolución del pedido') FROM ref;
SELECT pg_temp.verificar('Anular venta de pedido: vuelve 3 al Almacén y 1 a Bodega',
    (SELECT stock_almacen = 3 AND stock_bodega = 7 FROM productos WHERE id_producto = 90701)
    AND (SELECT consistente FROM fn_validar_kardex(90701)));

-- ============================ Auditoría de precios (023) ============================
SELECT set_config('simo.id_usuario', (SELECT u_inv::TEXT FROM ref), true);
UPDATE productos SET precio_venta = 2800 WHERE id_producto = 90701;
SELECT pg_temp.verificar('Cambiar un precio deja CAMBIO_PRECIO con el antes y el después',
    (SELECT id_usuario = ref.u_inv AND (datos_anteriores ->> 'precio_venta')::NUMERIC = 2500
            AND (datos_nuevos ->> 'precio_venta')::NUMERIC = 2800
     FROM log_auditoria, ref WHERE accion = 'CAMBIO_PRECIO' AND id_entidad = 90701));
UPDATE productos SET nombre = 'Otro nombre', precio_venta = 2800 WHERE id_producto = 90701;
SELECT pg_temp.verificar('Si el precio no cambia no se registra nada',
    (SELECT count(*) = 1 FROM log_auditoria WHERE accion = 'CAMBIO_PRECIO' AND id_entidad = 90701));
SELECT set_config('simo.id_usuario', '', true);
SELECT pg_temp.debe_fallar('Sin usuario identificado no se cambia un precio', '23502',
    'UPDATE productos SET precio_compra = 1100 WHERE id_producto = 90701');

DO $$ BEGIN RAISE NOTICE 'Todas las pruebas de ventas, traslados y pagos pasaron'; END $$;

ROLLBACK;
