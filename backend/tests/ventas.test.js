// backend/tests/ventas.test.js
const request = require('supertest');
const express = require('express');

// 1. MOCK: Simulamos la base de datos para no afectar Neon
jest.mock('../db', () => {
    const mClient = {
        query: jest.fn(),
        release: jest.fn(),
    };
    return {
        connect: jest.fn(() => mClient)
    };
});

// 2. MOCK: Simulamos el Auth Middleware para pasar la seguridad en las pruebas
jest.mock('../middleware/authMiddleware', () => ({
    verificarToken: (req, res, next) => {
        req.usuario = { id_usuario: 1, id_rol: 1 }; // Simulamos ser el ADMIN
        next();
    },
    verificarRol: () => (req, res, next) => next()
}));

const pool = require('../db');
const ventasRoutes = require('../routes/ventasRoutes');

// 3. Configurar una app Express temporal solo para las pruebas
const app = express();
app.use(express.json());
app.use('/api/sales', ventasRoutes);

describe('POST /api/sales - Pruebas de Integración y Deducción en Cascada (HU-07)', () => {
    let client;

    beforeEach(() => {
        // Reiniciamos los mocks antes de cada prueba
        client = {
            query: jest.fn(),
            release: jest.fn(),
        };
        pool.connect.mockResolvedValue(client);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Debe procesar la venta con deducción en cascada (Almacén + Bodega) y devolver HTTP 201 (HU-07)', async () => {
        // Simulamos un producto que tiene 2 en Almacén y 8 en Bodega (Total = 10)
        // El cliente compra 5 unidades. Se deben descontar 2 de Almacén y 3 de Bodega sin perder la venta.
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({   // SELECT metodos_pago
                rowCount: 1,
                rows: [{ id_metodo_pago: 1 }]
            })
            .mockResolvedValueOnce({   // SELECT ... FOR UPDATE (Producto con stock dual)
                rowCount: 1,
                rows: [{
                    id_producto: 1,
                    nombre: 'Teclado Gamer',
                    precio_compra: 40000,
                    precio_venta: 75000,
                    stock_bodega: 8,
                    stock_almacen: 2,
                    stock_total: 10,
                    estado: true
                }]
            })
            .mockResolvedValueOnce({   // INSERT ventas
                rowCount: 1,
                rows: [{ id_venta: 100, fecha_venta: new Date().toISOString() }]
            })
            .mockResolvedValueOnce({}) // INSERT detalles_ventas
            .mockResolvedValueOnce({}) // UPDATE productos (stock_almacen = 0, stock_bodega = 5)
            .mockResolvedValueOnce({}) // INSERT movimientos_inventario (SALIDA_VENTA ALMACEN = 2)
            .mockResolvedValueOnce({}) // INSERT movimientos_inventario (SALIDA_VENTA BODEGA = 3)
            .mockResolvedValueOnce({}); // COMMIT

        const response = await request(app)
            .post('/api/sales')
            .send({
                metodo_pago: 'EFECTIVO',
                productos: [{ id_producto: 1, cantidad: 5 }]
            });

        // Verificamos los códigos de estado HTTP esperados
        expect(response.status).toBe(201);
        expect(response.body.message).toContain('deducción en cascada');
        expect(response.body.venta.detalles[0].deduccion_cascada).toEqual({
            desde_almacen: 2,
            desde_bodega: 3
        });

        // Verificamos que se haya ejecutado el UPDATE de stock dual con los nuevos saldos
        const updateCall = client.query.mock.calls.find(call =>
            call[0].includes('UPDATE productos') && call[0].includes('stock_almacen = $1')
        );
        expect(updateCall).toBeDefined();
        // nuevoAlmacen = 0, nuevoBodega = 5, id_producto = 1
        expect(updateCall[1]).toEqual([0, 5, 1]);

        // Verificamos que se hayan generado los 2 movimientos de Kardex (Almacén y Bodega)
        const kardexCalls = client.query.mock.calls.filter(call =>
            call[0].includes('INSERT INTO movimientos_inventario')
        );
        expect(kardexCalls.length).toBe(2);
        expect(kardexCalls[0][0]).toContain("'ALMACEN'");
        expect(kardexCalls[0][1][1]).toBe(2); // 2 unidades de almacén
        expect(kardexCalls[1][0]).toContain("'BODEGA'");
        expect(kardexCalls[1][1][1]).toBe(3); // 3 unidades de bodega
    });

    it('Debe devolver error HTTP 400 y hacer ROLLBACK si no hay stock total suficiente', async () => {
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({   // SELECT metodos_pago
                rowCount: 1,
                rows: [{ id_metodo_pago: 1 }]
            })
            .mockResolvedValueOnce({   // SELECT ... FOR UPDATE (Producto con stock insuficiente en total)
                rowCount: 1,
                rows: [{
                    id_producto: 2,
                    nombre: 'Hamburguesa',
                    precio_compra: 8000,
                    precio_venta: 15000,
                    stock_bodega: 1,
                    stock_almacen: 0,
                    stock_total: 1,
                    estado: true
                }]
            })
            .mockResolvedValueOnce({}); // ROLLBACK

        const response = await request(app)
            .post('/api/sales')
            .send({
                productos: [{ id_producto: 2, cantidad: 5 }] // Intentamos comprar 5 habiendo solo 1
            });

        // Verificamos los códigos de estado HTTP esperados
        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Stock insuficiente');

        // Verificamos que se haya ejecutado el ROLLBACK para cancelar la transacción
        const rollbackCall = client.query.mock.calls.find(call => call[0] === 'ROLLBACK');
        expect(rollbackCall).toBeDefined();
    });
});