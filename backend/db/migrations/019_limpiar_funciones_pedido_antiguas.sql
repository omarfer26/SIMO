-- 019 — Limpieza de la primera versión de la reserva de pedidos.
--
-- La migración 014_pedidos_stock.sql creaba fn_salida_pedido y
-- fn_reverso_pedido para que el backend en JavaScript orquestara el descuento
-- y la devolución de stock. Ese archivo se retiró del repositorio: ahora el
-- descuento y la reversión los hace fn_cambiar_estado_pedido (migraciones 016
-- y 018) dentro de la misma transacción del cambio de estado, así que las dos
-- funciones viejas quedaron sin uso.
--
-- Esta migración las elimina de las bases donde ya se habían creado (Neon,
-- equipos). Es idempotente: si no existen, Postgres responde NOTICE y sigue.

DROP FUNCTION IF EXISTS fn_salida_pedido(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS fn_reverso_pedido(INTEGER, INTEGER);
