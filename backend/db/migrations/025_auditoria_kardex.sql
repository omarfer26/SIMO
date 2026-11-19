-- =====================================================================
-- SIMO - Migración 025: auditoría completa del Kardex (SCRUM-169)
-- Funciones: fn_auditar_documentos_kardex, sp_auditar_kardex
-- Requisitos: RF-11, RNF-04 | CU-08
--
-- fn_kardex_producto y fn_validar_kardex (012) recalculan el saldo de cada
-- producto movimiento a movimiento y lo comparan con el stock: prueban que el
-- Kardex es coherente CONSIGO MISMO. Eso no basta: si una venta descontara 3
-- unidades cuando su línea dice 2, el saldo cuadraría igual. Esta migración
-- valida además que cada movimiento corresponda exactamente al documento que
-- lo originó:
--
--   VENTA   POS: las salidas por producto suman lo que dicen sus líneas.
--           Venta de un pedido: no tiene salidas propias (el pedido ya
--           descontó; tenerlas sería descontar dos veces).
--           ANULADA: los reversos devuelven a cada ubicación exactamente lo
--           que salió de ella. COMPLETADA: no tiene reversos.
--   PEDIDO  Si pasó por EN_PREPARACION: sus salidas suman lo que dicen sus
--           líneas. Si no: no tiene salidas, y no puede estar EN_PREPARACION,
--           LISTO ni ENTREGADO. CANCELADO: los reversos
--           devuelven a cada ubicación lo que salió. Si no: no tiene reversos.
--   COMPRA  CONFIRMADA: las entradas suman lo que dicen sus líneas.
--           BORRADOR: no tiene entradas.
--   AJUSTE  Cada ajuste manual tiene su registro AJUSTE_INVENTARIO en el log
--           de auditoría (RF-24).
--
-- sp_auditar_kardex reúne las dos auditorías (saldos y documentos). Con
-- p_estricto = true falla (SM033) si encuentra cualquier inconsistencia: es
-- la verificación que usan la restauración de respaldos y la integración
-- continua.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_auditar_documentos_kardex()
RETURNS TABLE (
    documento    VARCHAR,
    id_documento INTEGER,
    id_producto  INTEGER,
    ubicacion    VARCHAR,
    problema     TEXT,
    esperado     NUMERIC,
    registrado   NUMERIC
) AS $$
    WITH
    -- ------------------------------------------------------------ ventas
    lineas_venta AS (
        SELECT d.id_venta, d.id_producto, sum(d.cantidad) AS cantidad FROM detalles_ventas d GROUP BY 1, 2
    ),
    salidas_venta AS (
        SELECT m.id_venta, m.id_producto, sum(m.cantidad) AS cantidad
        FROM movimientos_inventario m WHERE m.tipo_movimiento = 'SALIDA_VENTA' GROUP BY 1, 2
    ),
    -- Lo que salió por la venta, por ubicación: de la propia venta o del pedido de origen
    salidas_origen_venta AS (
        SELECT v.id_venta, m.id_producto, m.ubicacion_origen AS ubicacion, sum(m.cantidad) AS cantidad
        FROM ventas v
        JOIN movimientos_inventario m
          ON (v.id_pedido IS NULL AND m.id_venta = v.id_venta AND m.tipo_movimiento = 'SALIDA_VENTA')
          OR (v.id_pedido IS NOT NULL AND m.id_pedido = v.id_pedido AND m.tipo_movimiento = 'SALIDA_PEDIDO')
        GROUP BY 1, 2, 3
    ),
    reversos_venta AS (
        SELECT m.id_venta, m.id_producto, m.ubicacion_destino AS ubicacion, sum(m.cantidad) AS cantidad
        FROM movimientos_inventario m WHERE m.tipo_movimiento = 'REVERSO_VENTA' GROUP BY 1, 2, 3
    ),
    -- ----------------------------------------------------------- pedidos
    preparados AS (
        SELECT DISTINCT h.id_pedido FROM historial_estados_pedido h WHERE h.estado_nuevo = 'EN_PREPARACION'
    ),
    lineas_pedido AS (
        SELECT d.id_pedido, d.id_producto, sum(d.cantidad) AS cantidad FROM detalles_pedidos d GROUP BY 1, 2
    ),
    salidas_pedido AS (
        SELECT m.id_pedido, m.id_producto, sum(m.cantidad) AS cantidad
        FROM movimientos_inventario m WHERE m.tipo_movimiento = 'SALIDA_PEDIDO' GROUP BY 1, 2
    ),
    salidas_pedido_ubic AS (
        SELECT m.id_pedido, m.id_producto, m.ubicacion_origen AS ubicacion, sum(m.cantidad) AS cantidad
        FROM movimientos_inventario m WHERE m.tipo_movimiento = 'SALIDA_PEDIDO' GROUP BY 1, 2, 3
    ),
    reversos_pedido AS (
        SELECT m.id_pedido, m.id_producto, m.ubicacion_destino AS ubicacion, sum(m.cantidad) AS cantidad
        FROM movimientos_inventario m WHERE m.tipo_movimiento = 'REVERSO_PEDIDO' GROUP BY 1, 2, 3
    ),
    -- ----------------------------------------------------------- compras
    lineas_compra AS (
        SELECT d.id_compra, d.id_producto, sum(d.cantidad) AS cantidad FROM detalles_compras d GROUP BY 1, 2
    ),
    entradas_compra AS (
        SELECT m.id_compra, m.id_producto, sum(m.cantidad) AS cantidad
        FROM movimientos_inventario m WHERE m.tipo_movimiento = 'ENTRADA_COMPRA' AND m.id_compra IS NOT NULL GROUP BY 1, 2
    )

    -- Venta POS: salidas = líneas
    SELECT 'VENTA'::VARCHAR, v.id_venta, x.id_producto, NULL::VARCHAR,
           'Las salidas del Kardex no coinciden con las líneas de la venta',
           coalesce(x.esperado, 0), coalesce(x.registrado, 0)
    FROM (SELECT coalesce(l.id_venta, s.id_venta) AS id_venta, coalesce(l.id_producto, s.id_producto) AS id_producto,
                 l.cantidad AS esperado, s.cantidad AS registrado
          FROM lineas_venta l FULL JOIN salidas_venta s ON s.id_venta = l.id_venta AND s.id_producto = l.id_producto) x
    JOIN ventas v ON v.id_venta = x.id_venta
    WHERE v.id_pedido IS NULL AND coalesce(x.esperado, 0) <> coalesce(x.registrado, 0)

    UNION ALL
    -- Venta de un pedido: sin salidas propias
    SELECT 'VENTA', v.id_venta, s.id_producto, NULL,
           'La venta viene de un pedido y tiene salidas propias (descuento doble)', 0, s.cantidad
    FROM salidas_venta s JOIN ventas v ON v.id_venta = s.id_venta
    WHERE v.id_pedido IS NOT NULL

    UNION ALL
    -- Venta ANULADA: reversos = salidas, por ubicación; COMPLETADA: sin reversos
    SELECT 'VENTA', v.id_venta, x.id_producto, x.ubicacion,
           CASE WHEN v.estado = 'ANULADA' THEN 'La anulación no devolvió exactamente lo que salió de esta ubicación'
                ELSE 'La venta está COMPLETADA pero tiene devoluciones' END,
           CASE WHEN v.estado = 'ANULADA' THEN coalesce(x.salio, 0) ELSE 0 END, coalesce(x.devuelto, 0)
    FROM (SELECT coalesce(s.id_venta, r.id_venta) AS id_venta, coalesce(s.id_producto, r.id_producto) AS id_producto,
                 coalesce(s.ubicacion, r.ubicacion) AS ubicacion, s.cantidad AS salio, r.cantidad AS devuelto
          FROM salidas_origen_venta s
          FULL JOIN reversos_venta r ON r.id_venta = s.id_venta AND r.id_producto = s.id_producto AND r.ubicacion = s.ubicacion) x
    JOIN ventas v ON v.id_venta = x.id_venta
    WHERE (v.estado = 'ANULADA' AND coalesce(x.salio, 0) <> coalesce(x.devuelto, 0))
       OR (v.estado = 'COMPLETADA' AND coalesce(x.devuelto, 0) > 0)

    UNION ALL
    -- Pedido preparado: salidas = líneas; no preparado: sin salidas
    SELECT 'PEDIDO', p.id_pedido, x.id_producto, NULL,
           CASE WHEN pr.id_pedido IS NOT NULL THEN 'Las salidas del Kardex no coinciden con las líneas del pedido'
                ELSE 'El pedido nunca pasó a EN_PREPARACION pero descontó stock' END,
           CASE WHEN pr.id_pedido IS NOT NULL THEN coalesce(x.esperado, 0) ELSE 0 END, coalesce(x.registrado, 0)
    FROM (SELECT coalesce(l.id_pedido, s.id_pedido) AS id_pedido, coalesce(l.id_producto, s.id_producto) AS id_producto,
                 l.cantidad AS esperado, s.cantidad AS registrado
          FROM lineas_pedido l FULL JOIN salidas_pedido s ON s.id_pedido = l.id_pedido AND s.id_producto = l.id_producto) x
    JOIN pedidos p ON p.id_pedido = x.id_pedido
    LEFT JOIN preparados pr ON pr.id_pedido = p.id_pedido
    WHERE (pr.id_pedido IS NOT NULL AND coalesce(x.esperado, 0) <> coalesce(x.registrado, 0))
       OR (pr.id_pedido IS NULL AND coalesce(x.registrado, 0) > 0)

    UNION ALL
    -- Pedido que avanzó sin pasar por EN_PREPARACION: nunca descontó su stock
    SELECT 'PEDIDO', p.id_pedido, NULL, NULL,
           'El pedido está ' || p.estado || ' sin haber pasado por EN_PREPARACION (no descontó stock)', NULL, NULL
    FROM pedidos p
    WHERE p.estado IN ('EN_PREPARACION', 'LISTO', 'ENTREGADO')
      AND NOT EXISTS (SELECT 1 FROM preparados pr WHERE pr.id_pedido = p.id_pedido)

    UNION ALL
    -- Pedido CANCELADO: reversos = salidas, por ubicación; otro estado: sin reversos
    SELECT 'PEDIDO', p.id_pedido, x.id_producto, x.ubicacion,
           CASE WHEN p.estado = 'CANCELADO' THEN 'La cancelación no devolvió exactamente lo que salió de esta ubicación'
                ELSE 'El pedido no está CANCELADO pero tiene devoluciones' END,
           CASE WHEN p.estado = 'CANCELADO' THEN coalesce(x.salio, 0) ELSE 0 END, coalesce(x.devuelto, 0)
    FROM (SELECT coalesce(s.id_pedido, r.id_pedido) AS id_pedido, coalesce(s.id_producto, r.id_producto) AS id_producto,
                 coalesce(s.ubicacion, r.ubicacion) AS ubicacion, s.cantidad AS salio, r.cantidad AS devuelto
          FROM salidas_pedido_ubic s
          FULL JOIN reversos_pedido r ON r.id_pedido = s.id_pedido AND r.id_producto = s.id_producto AND r.ubicacion = s.ubicacion) x
    JOIN pedidos p ON p.id_pedido = x.id_pedido
    -- Una venta anulada de este pedido devuelve con REVERSO_VENTA: ese caso ya lo revisa la venta
    WHERE (p.estado = 'CANCELADO' AND coalesce(x.salio, 0) <> coalesce(x.devuelto, 0))
       OR (p.estado <> 'CANCELADO' AND coalesce(x.devuelto, 0) > 0)

    UNION ALL
    -- Compra CONFIRMADA: entradas = líneas; BORRADOR: sin entradas
    SELECT 'COMPRA', c.id_compra, x.id_producto, NULL,
           CASE WHEN c.estado = 'CONFIRMADA' THEN 'Las entradas del Kardex no coinciden con las líneas de la compra'
                ELSE 'La compra está en BORRADOR pero ya ingresó mercancía' END,
           CASE WHEN c.estado = 'CONFIRMADA' THEN coalesce(x.esperado, 0) ELSE 0 END, coalesce(x.registrado, 0)
    FROM (SELECT coalesce(l.id_compra, e.id_compra) AS id_compra, coalesce(l.id_producto, e.id_producto) AS id_producto,
                 l.cantidad AS esperado, e.cantidad AS registrado
          FROM lineas_compra l FULL JOIN entradas_compra e ON e.id_compra = l.id_compra AND e.id_producto = l.id_producto) x
    JOIN compras c ON c.id_compra = x.id_compra
    WHERE (c.estado = 'CONFIRMADA' AND coalesce(x.esperado, 0) <> coalesce(x.registrado, 0))
       OR (c.estado <> 'CONFIRMADA' AND coalesce(x.registrado, 0) > 0)

    UNION ALL
    -- Ajuste manual sin su registro en la auditoría (RF-24)
    SELECT 'AJUSTE', m.id_movimiento::INTEGER, m.id_producto, coalesce(m.ubicacion_origen, m.ubicacion_destino),
           'El ajuste manual no tiene su registro AJUSTE_INVENTARIO en el log de auditoría', 1, 0
    FROM movimientos_inventario m
    WHERE m.tipo_movimiento IN ('AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')
      AND NOT EXISTS (SELECT 1 FROM log_auditoria l
                      WHERE l.accion = 'AJUSTE_INVENTARIO' AND l.entidad = 'productos' AND l.id_entidad = m.id_producto
                        AND (l.datos_nuevos ->> 'id_movimiento')::BIGINT = m.id_movimiento)

    ORDER BY 1, 2, 3, 4;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION fn_auditar_documentos_kardex() IS
    'Valida que cada movimiento del Kardex corresponda a su documento: ventas, anulaciones, pedidos, cancelaciones, compras y ajustes (SCRUM-169)';

-- ---------------------------------------------------------------------
-- sp_auditar_kardex: auditoría completa (saldos + documentos)
--   CALL sp_auditar_kardex();                 -- informa y devuelve conteos
--   CALL sp_auditar_kardex(p_estricto => true) -- además falla si hay problemas
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_auditar_kardex(
    INOUT productos_revisados        INTEGER DEFAULT NULL,
    INOUT movimientos_revisados      BIGINT  DEFAULT NULL,
    INOUT productos_inconsistentes   INTEGER DEFAULT NULL,
    INOUT documentos_inconsistentes  INTEGER DEFAULT NULL,
    p_estricto                       BOOLEAN DEFAULT FALSE
) AS $$
BEGIN
    SELECT count(*), coalesce(sum(movimientos), 0), count(*) FILTER (WHERE NOT consistente)
      INTO productos_revisados, movimientos_revisados, productos_inconsistentes
      FROM fn_validar_kardex();
    SELECT count(DISTINCT (documento, id_documento)) INTO documentos_inconsistentes FROM fn_auditar_documentos_kardex();

    IF productos_inconsistentes > 0 OR documentos_inconsistentes > 0 THEN
        IF p_estricto THEN
            RAISE EXCEPTION 'Kardex inconsistente: % producto(s) y % documento(s) con diferencias',
                productos_inconsistentes, documentos_inconsistentes
                USING ERRCODE = 'SM033',
                      HINT = 'Revise SELECT * FROM fn_validar_kardex() WHERE NOT consistente y SELECT * FROM fn_auditar_documentos_kardex()';
        END IF;
        RAISE WARNING 'Kardex inconsistente: % producto(s) y % documento(s) con diferencias',
            productos_inconsistentes, documentos_inconsistentes;
    ELSE
        RAISE NOTICE 'Kardex consistente: % productos y % movimientos revisados', productos_revisados, movimientos_revisados;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON PROCEDURE sp_auditar_kardex(INTEGER, BIGINT, INTEGER, INTEGER, BOOLEAN) IS
    'Auditoría completa del Kardex: saldos por producto y correspondencia con documentos; estricto falla con SM033 (SCRUM-169)';

COMMIT;
