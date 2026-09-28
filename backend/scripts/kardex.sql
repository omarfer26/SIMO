CREATE TABLE kardex (
    id_kardex SERIAL PRIMARY KEY,
    id_producto INTEGER NOT NULL,
    id_movimiento INTEGER NOT NULL,
    
    -- Seccion Entrada
    cantidad_entrada INTEGER DEFAULT 0 CHECK (cantidad_entrada >= 0),
    costo_unitario_entrada NUMERIC(12, 2) DEFAULT 0 CHECK (costo_unitario_entrada >= 0),
    total_entrada NUMERIC(12, 2) DEFAULT 0 CHECK (total_entrada >= 0),

    -- Sección Salida
    cantidad_salida INTEGER DEFAULT 0 CHECK (cantidad_salida >= 0),
    costo_unitario_salida NUMERIC(12, 2) DEFAULT 0 CHECK (costo_unitario_salida >= 0),
    total_salida NUMERIC(12, 2) DEFAULT 0 CHECK (total_salida >= 0),

    -- Sección Saldo / Balances Acumulados
    saldo_cantidad INTEGER NOT NULL CHECK (saldo_cantidad >= 0),
    costo_promedio_ponderado NUMERIC(12, 2) NOT NULL CHECK (costo_promedio_ponderado >= 0),
    saldo_valor_total NUMERIC(12, 2) NOT NULL CHECK (saldo_valor_total >= 0),

    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Llaves foráneas
    CONSTRAINT fk_kardex_producto 
        FOREIGN KEY (id_producto) 
        REFERENCES productos (id_producto) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,

    CONSTRAINT fk_kardex_movimiento 
        FOREIGN KEY (id_movimiento) 
        REFERENCES movimientos_inventario (id_movimiento) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE
);