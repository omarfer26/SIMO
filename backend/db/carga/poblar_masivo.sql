-- =====================================================================
-- SIMO - Población masiva de datos para pruebas de carga (SCRUM-131)
--
-- Genera productos, clientes y ventas simulados, COHERENTES con las reglas
-- del sistema: el stock inicial entra por compra a Bodega, se traslada al
-- Almacén y cada línea de venta genera su salida en el Kardex con el saldo
-- correcto. Al terminar, fn_validar_kardex() debe reportar todo consistente.
--
-- Uso (base local o de pruebas, con las migraciones y el seed aplicados):
--   psql -d simo_retail -v productos=2000 -v clientes=5000 -v ventas=20000 \
--        -f db/carga/poblar_masivo.sql
-- Valores por defecto: 1000 productos, 2000 clientes, 10000 ventas.
--
-- IMPORTANTE: los movimientos del Kardex son inalterables, así que estos
-- datos no se pueden borrar después. Por eso el script se niega a correr en
-- la base compartida de Neon (neondb) salvo que se pase -v forzar=si.
-- Los datos se reconocen por: SKU 'CARGA-…', clientes con documento '99…',
-- ventas y movimientos con documento 'CARGA-…'.
-- =====================================================================

\set ON_ERROR_STOP 1
\if :{?productos} \else \set productos 1000 \endif
\if :{?clientes}  \else \set clientes 2000  \endif
\if :{?ventas}    \else \set ventas 10000   \endif
\if :{?forzar}    \else \set forzar no      \endif

SELECT set_config('simo.carga_productos', :'productos', false),
       set_config('simo.carga_clientes', :'clientes', false),
       set_config('simo.carga_ventas', :'ventas', false),
       set_config('simo.carga_forzar', :'forzar', false) \gset

BEGIN;

DO $$
BEGIN
    IF current_database() = 'neondb' AND current_setting('simo.carga_forzar') <> 'si' THEN
        RAISE EXCEPTION 'Población masiva bloqueada en la base compartida (neondb): los datos no se podrían borrar. Use una base local o pase -v forzar=si';
    END IF;
    IF EXISTS (SELECT 1 FROM productos WHERE sku LIKE 'CARGA-%') THEN
        RAISE EXCEPTION 'Esta base ya tiene datos de carga masiva (SKU CARGA-%%)';
    END IF;
END
$$;

-- Datos reproducibles: misma semilla, mismos datos en cada ejecución
SELECT setseed(0.42);

CREATE TEMP TABLE parametros AS
SELECT current_setting('simo.carga_productos')::INT AS n_productos,
       current_setting('simo.carga_clientes')::INT  AS n_clientes,
       current_setting('simo.carga_ventas')::INT    AS n_ventas,
       (SELECT id_usuario FROM usuarios u JOIN roles r USING (id_rol) WHERE r.codigo = 'INVENTARIO' ORDER BY id_usuario LIMIT 1) AS u_inventario,
       (SELECT array_agg(id_usuario) FROM usuarios u JOIN roles r USING (id_rol) WHERE r.codigo IN ('VENDEDOR', 'ADMIN', 'GERENTE')) AS vendedores,
       (SELECT array_agg(id_metodo_pago) FROM metodos_pago WHERE estado) AS metodos,
       (SELECT array_agg(id_categoria) FROM categorias) AS categorias,
       (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'und') AS und,
       (SELECT id_unidad FROM unidades_medida WHERE abreviatura = 'kg') AS kg;

-- ------------------------------------------------------------------ productos
INSERT INTO productos (id_categoria, id_unidad, sku, nombre, descripcion, precio_compra, precio_venta,
                       stock_minimo_bodega, stock_minimo_almacen)
SELECT par.categorias[1 + (g % array_length(par.categorias, 1))],
       CASE WHEN g % 10 = 0 THEN par.kg ELSE par.und END,
       'CARGA-' || lpad(g::TEXT, 6, '0'),
       'Producto de carga ' || g,
       'Generado para pruebas de carga (SCRUM-131)',
       c.costo,
       round(c.costo * (1.25 + random() * 0.5)::NUMERIC, -2),
       10, 5
FROM parametros par, generate_series(1, par.n_productos) g,
     LATERAL (SELECT round((1000 + random() * 199000 + g * 0)::NUMERIC, -2) AS costo) c;   -- g: un costo por producto

CREATE TEMP TABLE prod_carga AS
SELECT p.id_producto, p.precio_compra, p.precio_venta, row_number() OVER (ORDER BY p.id_producto) AS n
FROM productos p WHERE p.sku LIKE 'CARGA-%';

-- ------------------------------------------------------------------ clientes
INSERT INTO clientes (identificacion, nombre, telefono, correo)
SELECT '99' || lpad(g::TEXT, 8, '0'),
       'Cliente de carga ' || g,
       '300' || lpad((random() * 9999999)::INT::TEXT, 7, '0'),
       'cliente.carga' || g || '@correo.com'
FROM parametros par, generate_series(1, par.n_clientes) g;

CREATE TEMP TABLE cli_carga AS
SELECT id_cliente, row_number() OVER (ORDER BY id_cliente) AS n FROM clientes WHERE identificacion LIKE '99%';

-- ------------------------------------------------------------- stock inicial
-- Hace 366 días: entrada por compra a Bodega (costo = precio de compra).
-- Hace 365 días: traslado de una parte al Almacén (mostrador).
-- La cantidad inicial se calcula para alcanzar a cubrir las ventas simuladas.
CREATE TEMP TABLE stock_ini AS
SELECT pc.n, pc.id_producto, pc.precio_compra,
       (ceil(par.n_ventas * 8.0 / par.n_productos) * (1 + random()) + 20)::INT AS entrada
FROM prod_carga pc, parametros par;

INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_destino, cantidad, costo_unitario,
                                    saldo_bodega, saldo_almacen, id_usuario, id_proveedor,
                                    documento_referencia, fecha_movimiento)
SELECT s.id_producto, 'ENTRADA_COMPRA', 'BODEGA', s.entrada, s.precio_compra, s.entrada, 0, par.u_inventario,
       (SELECT min(id_proveedor) FROM proveedores), 'CARGA-COMPRA-INICIAL', now() - interval '366 days'
FROM stock_ini s, parametros par;

INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, ubicacion_destino, cantidad,
                                    costo_unitario, saldo_bodega, saldo_almacen, id_usuario,
                                    documento_referencia, fecha_movimiento)
SELECT s.id_producto, 'TRASLADO_INTERNO', 'BODEGA', 'ALMACEN', s.entrada * 3 / 10, s.precio_compra,
       s.entrada - s.entrada * 3 / 10, s.entrada * 3 / 10, par.u_inventario,
       'CARGA-TRASLADO-INICIAL', now() - interval '365 days'
FROM stock_ini s, parametros par;

-- ------------------------------------------------------------------ ventas
-- Fechas repartidas en los últimos 364 días y procesadas en orden
-- cronológico. Cada venta tiene de 1 a 5 productos distintos; cada línea
-- descuenta primero del Almacén y luego de Bodega (deducción en cascada,
-- RN-02), con un movimiento SALIDA_VENTA por ubicación y su saldo correcto.
-- El 70 % de las ventas tiene cliente identificado; 10 % lleva descuento.
DO $$
DECLARE
    par        RECORD;
    v          RECORD;
    ids        INT[];
    costos     NUMERIC[];
    precios    NUMERIC[];
    decimales  BOOLEAN[];
    bodega     NUMERIC[];
    almacen    NUMERIC[];
    clientes   INT[];
    digitales  INT[];
    v_id_venta INT;
    v_metodo   INT;
    v_lineas   INT;
    v_inicio   INT;
    v_salto    INT;
    k          INT;
    i          INT;
    v_cant     NUMERIC;
    v_subtotal NUMERIC;
    v_desc     NUMERIC;
    -- Líneas de la venta en curso: producto (posición), cantidad, de Almacén, de Bodega
    l_pos      INT[];
    l_cant     NUMERIC[];
    l_alm      NUMERIC[];
    l_bod      NUMERIC[];
BEGIN
    SELECT * INTO par FROM parametros;
    SELECT array_agg(pc.id_producto ORDER BY pc.n), array_agg(pc.precio_compra ORDER BY pc.n),
           array_agg(pc.precio_venta ORDER BY pc.n), array_agg(u.permite_decimales ORDER BY pc.n),
           array_agg(s.entrada - s.entrada * 3 / 10 ORDER BY pc.n)::NUMERIC[], array_agg(s.entrada * 3 / 10 ORDER BY pc.n)::NUMERIC[]
      INTO ids, costos, precios, decimales, bodega, almacen
      FROM prod_carga pc
      JOIN productos p USING (id_producto)
      JOIN unidades_medida u ON u.id_unidad = p.id_unidad
      JOIN stock_ini s ON s.n = pc.n;
    SELECT array_agg(id_cliente ORDER BY n) INTO clientes FROM cli_carga;
    -- Métodos con comprobante: la venta lleva referencia y crea su pago pendiente (022)
    SELECT array_agg(id_metodo_pago) INTO digitales FROM metodos_pago WHERE codigo IN ('NEQUI', 'DAVIPLATA', 'TRANSFERENCIA');

    FOR v IN
        SELECT g, now() - interval '364 days' + random() * interval '364 days' AS fecha
        FROM generate_series(1, par.n_ventas) g ORDER BY 2
    LOOP
        -- Estadísticas al día cada 2.000 ventas. Sin esto el planificador sigue
        -- creyendo que ventas y sus líneas están vacías (último ANALYZE) y las
        -- verificaciones de llave foránea recorren la tabla entera en cada
        -- inserción: la carga se vuelve cuadrática (50.000 ventas: 3,5 min en
        -- vez de 20 s). El ANALYZE invalida esos planes guardados.
        IF v.g % 2000 = 0 THEN
            ANALYZE ventas;
            ANALYZE detalles_ventas;
            ANALYZE movimientos_inventario;
        END IF;

        -- 1. Se arman las líneas en memoria, descontando en cascada (RN-02)
        v_lineas := 1 + floor(random() * 5)::INT;
        v_inicio := floor(random() * array_length(ids, 1))::INT;
        v_salto  := 1 + floor(random() * 7)::INT;
        v_subtotal := 0;
        l_pos := '{}'; l_cant := '{}'; l_alm := '{}'; l_bod := '{}';
        FOR k IN 0 .. v_lineas - 1 LOOP
            i := 1 + (v_inicio + k * v_salto) % array_length(ids, 1);   -- productos distintos en la venta
            v_cant := CASE WHEN decimales[i] THEN round((0.25 + random() * 2.75)::NUMERIC, 2)
                           ELSE 1 + floor(random() * 4) END;
            v_cant := least(v_cant, bodega[i] + almacen[i]);
            CONTINUE WHEN v_cant <= 0;                                  -- sin existencias: no se vende
            l_pos  := l_pos  || i;
            l_cant := l_cant || v_cant;
            l_alm  := l_alm  || least(v_cant, almacen[i]);
            l_bod  := l_bod  || (v_cant - least(v_cant, almacen[i]));
            almacen[i] := almacen[i] - l_alm[array_length(l_pos, 1)];
            bodega[i]  := bodega[i]  - l_bod[array_length(l_pos, 1)];
            v_subtotal := v_subtotal + round(v_cant * precios[i], 2);
        END LOOP;
        -- Todos sus productos agotados: la venta no se crea
        CONTINUE WHEN coalesce(array_length(l_pos, 1), 0) = 0;

        -- 2. La venta se inserta ya con sus totales (chk_ventas_total)
        v_desc := CASE WHEN random() < 0.1 THEN round(v_subtotal * 0.05, 2) ELSE 0 END;
        v_metodo := par.metodos[1 + floor(random() * array_length(par.metodos, 1))::INT];
        INSERT INTO ventas (id_cliente, id_usuario, id_metodo_pago, fecha_venta, subtotal, descuento, total, referencia_pago)
        VALUES (CASE WHEN random() < 0.7 AND clientes IS NOT NULL THEN clientes[1 + floor(random() * array_length(clientes, 1))::INT] END,
                par.vendedores[1 + floor(random() * array_length(par.vendedores, 1))::INT],
                v_metodo, v.fecha, v_subtotal, v_desc, v_subtotal - v_desc,
                CASE WHEN v_metodo = ANY (digitales) THEN 'CARGA-REF-' || v.g END)
        RETURNING id_venta INTO v_id_venta;

        -- 3. Líneas y movimientos con el saldo que dejó cada salida
        FOR k IN 1 .. array_length(l_pos, 1) LOOP
            i := l_pos[k];
            INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, costo_unitario, subtotal_linea)
            VALUES (v_id_venta, ids[i], l_cant[k], precios[i], costos[i], round(l_cant[k] * precios[i], 2));
            -- El saldo de Almacén se registra antes de tocar Bodega
            IF l_alm[k] > 0 THEN
                INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                                                    saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia, fecha_movimiento)
                VALUES (ids[i], 'SALIDA_VENTA', 'ALMACEN', l_alm[k], costos[i], bodega[i] + l_bod[k], almacen[i],
                        par.u_inventario, v_id_venta, 'CARGA-VENTA-' || v_id_venta, v.fecha);
            END IF;
            IF l_bod[k] > 0 THEN
                INSERT INTO movimientos_inventario (id_producto, tipo_movimiento, ubicacion_origen, cantidad, costo_unitario,
                                                    saldo_bodega, saldo_almacen, id_usuario, id_venta, documento_referencia, fecha_movimiento)
                VALUES (ids[i], 'SALIDA_VENTA', 'BODEGA', l_bod[k], costos[i], bodega[i], almacen[i],
                        par.u_inventario, v_id_venta, 'CARGA-VENTA-' || v_id_venta, v.fecha);
            END IF;
        END LOOP;
    END LOOP;

    -- El stock final del producto es el último saldo del Kardex
    UPDATE productos p SET stock_bodega = bodega[pc.n], stock_almacen = almacen[pc.n]
    FROM prod_carga pc WHERE pc.id_producto = p.id_producto;
END
$$;

-- ------------------------------------------------------------- verificación
DO $$
DECLARE r RECORD;
BEGIN
    SELECT count(*) FILTER (WHERE NOT consistente) AS malos, count(*) AS total
      INTO r FROM fn_validar_kardex() f JOIN prod_carga pc USING (id_producto);
    IF r.malos > 0 THEN
        RAISE EXCEPTION 'Kardex inconsistente en % de % productos de carga', r.malos, r.total;
    END IF;
    RAISE NOTICE 'Kardex consistente en los % productos de carga', r.total;
END
$$;

COMMIT;

ANALYZE productos; ANALYZE clientes; ANALYZE ventas; ANALYZE detalles_ventas; ANALYZE movimientos_inventario;

SELECT (SELECT count(*) FROM productos WHERE sku LIKE 'CARGA-%')                         AS productos,
       (SELECT count(*) FROM clientes WHERE identificacion LIKE '99%')                     AS clientes,
       (SELECT count(*) FROM ventas v WHERE EXISTS (SELECT 1 FROM detalles_ventas d JOIN productos p USING (id_producto)
                                                    WHERE d.id_venta = v.id_venta AND p.sku LIKE 'CARGA-%')) AS ventas,
       (SELECT count(*) FROM detalles_ventas d JOIN productos p USING (id_producto) WHERE p.sku LIKE 'CARGA-%') AS lineas_venta,
       (SELECT count(*) FROM movimientos_inventario WHERE documento_referencia LIKE 'CARGA-%') AS movimientos;
