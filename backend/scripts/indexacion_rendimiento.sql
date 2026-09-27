CREATE INDEX idx_productos_categoria ON productos(id_categoria);
CREATE INDEX idx_movimientos_producto ON movimientos_inventario(id_producto);
CREATE INDEX idx_movimientos_fecha ON movimientos_inventario(fecha_movimiento);
CREATE INDEX idx_kardex_producto_fecha ON kardex(id_producto, fecha_registro DESC);