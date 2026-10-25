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

describe('POST /api/sales - Pruebas de Integración y Stock', () => {
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

    it('Debe procesar la venta, descontar stock y devolver HTTP 201', async () => {
        // Configuramos las respuestas simuladas de la base de datos
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({   // SELECT ... FOR UPDATE (Producto encontrado con stock)
                rowCount: 1,
                rows: [{ nombre: 'Explosoda', precio: 8000, stock: 10 }]
            })
            .mockResolvedValueOnce({   // INSERT ventas
                rows: [{ id_venta: 100 }]
            })
            .mockResolvedValueOnce({}) // INSERT detalles_venta
            .mockResolvedValueOnce({}) // UPDATE productos (Descuento de stock)
            .mockResolvedValueOnce({}); // COMMIT

        const response = await request(app)
            .post('/api/sales')
            .send({
                productos: [{ id_producto: 1, cantidad: 2 }]
            });

        // Verificamos los códigos de estado HTTP esperados
        expect(response.status).toBe(201);
        expect(response.body.message).toBe('Venta procesada exitosamente');

        // Verificamos que se haya ejecutado el UPDATE para descontar el stock
        const updateQueryCall = client.query.mock.calls.find(call =>
            call[0].includes('UPDATE productos SET stock = stock - $1')
        );
        expect(updateQueryCall).toBeDefined();
        // Verificamos que se intente descontar '2' unidades del producto '1'
        expect(updateQueryCall[1]).toEqual([2, 1]);
    });

    it('Debe devolver error HTTP 400 y hacer ROLLBACK si no hay stock suficiente', async () => {
        client.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({   // SELECT ... FOR UPDATE (Producto con stock insuficiente)
                rowCount: 1,
                rows: [{ nombre: 'Hamburguesa', precio: 15000, stock: 1 }] // Solo hay 1 en stock
            })
            .mockResolvedValueOnce({}); // ROLLBACK

        const response = await request(app)
            .post('/api/sales')
            .send({
                productos: [{ id_producto: 2, cantidad: 5 }] // Intentamos comprar 5
            });

        // Verificamos los códigos de estado HTTP esperados
        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Stock insuficiente');

        // Verificamos que se haya ejecutado el ROLLBACK para cancelar la transacción
        const rollbackCall = client.query.mock.calls.find(call => call[0] === 'ROLLBACK');
        expect(rollbackCall).toBeDefined();
    });
});