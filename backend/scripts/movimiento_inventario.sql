CREATE TABLE movimientos_inventario (
    id_movimiento SERIAL PRIMARY KEY,
    id_producto INTEGER NOT NULL,
    tipo_movimiento VARCHAR(30) NOT NULL CHECK (
        tipo_movimiento IN (
            'ENTRADA_COMPRA', 
            'SALIDA_VENTA', 
            'AJUSTE_POSITIVO', 
            'AJUSTE_NEGATIVO', 
            'DEVOLUCION_CLIENTE', 
            'DEVOLUCION_PROVEEDOR'
        )
    ),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(12, 2) NOT NULL CHECK (costo_unitario >= 0),
    precio_total NUMERIC(12, 2) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
    referencia_documento VARCHAR(100), -- Ej: 'FAC-001-2026', 'OC-992'
    motivo_observacion TEXT,
    id_usuario INTEGER,                -- ID del usuario que realizó la operación
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Llave foránea vinculada a la tabla de productos (SCRUM-32)
    CONSTRAINT fk_movimiento_producto 
        FOREIGN KEY (id_producto) 
        REFERENCES productos (id_producto) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE
);