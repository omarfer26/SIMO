// backend/tests/ventas.test.js
// Pruebas unitarias (Jest, `npm test`): no necesitan base de datos.
//
// La venta POS dejó de armarse en JavaScript: ahora la ejecuta la función
// fn_registrar_venta de PostgreSQL (migración 020), así que simular la base
// con mocks ya no prueba nada real. La venta, el descuento de stock en
// cascada y la anulación se prueban contra una base de verdad en:
//   - db/tests/010_ventas_traslados_pagos.sql        (47 pruebas SQL)
//   - tests/integracion/ventas.test.js               (npm run test:integracion)
// Aquí quedan las reglas que sí viven en JavaScript: la validación de números
// y fechas que llegan del navegador, y el filtro contra XSS.
const { aNumero, excedeDecimales, REGEX_ENTERO_POSITIVO } = require('../src/utils/numeros');
const { aInstante } = require('../src/utils/fechas');
const { limpiar } = require('../middleware/sanitizarXss');

describe('Cantidades y precios que llegan del POS', () => {
    it('acepta números y texto numérico, rechaza vacíos y texto', () => {
        expect(aNumero(2)).toBe(2);
        expect(aNumero('2.5')).toBe(2.5);
        expect(aNumero('')).toBeNaN();
        expect(aNumero('dos')).toBeNaN();
        expect(aNumero(null)).toBeNaN();
        expect(aNumero(Infinity)).toBeNaN();
    });

    it('limita los decimales: 3 en cantidades y 2 en dinero', () => {
        expect(excedeDecimales(1.125, 3)).toBe(false);
        expect(excedeDecimales(1.1255, 3)).toBe(true);
        expect(excedeDecimales(0.1 + 0.2, 2)).toBe(false); // tolera el error binario de punto flotante
        expect(excedeDecimales(19.999, 2)).toBe(true);
    });

    it('los identificadores son enteros positivos', () => {
        expect(REGEX_ENTERO_POSITIVO.test('15')).toBe(true);
        for (const malo of ['0', '-1', '1.5', 'abc', '', '1 OR 1=1']) {
            expect(REGEX_ENTERO_POSITIVO.test(malo)).toBe(false);
        }
    });
});

describe('Fechas de los filtros (hora de Colombia)', () => {
    it('una fecha sin hora cubre el día completo en UTC-5', () => {
        expect(aInstante('2026-11-09', false).toISOString()).toBe('2026-11-09T05:00:00.000Z');
        expect(aInstante('2026-11-09', true).toISOString()).toBe('2026-11-10T04:59:59.999Z');
    });

    it('distingue "no vino" (null) de "inválida" (undefined)', () => {
        expect(aInstante(undefined)).toBeNull();
        expect(aInstante('')).toBeNull();
        expect(aInstante('ayer')).toBeUndefined();
        expect(aInstante('2026-02-30')).toBeUndefined(); // día que no existe
        expect(aInstante('2026-13-01')).toBeUndefined();
        expect(aInstante(20261109)).toBeUndefined();
    });

    it('acepta fecha y hora ISO 8601', () => {
        expect(aInstante('2026-11-09T15:30:00Z').toISOString()).toBe('2026-11-09T15:30:00.000Z');
    });
});

describe('Filtro contra XSS', () => {
    it('neutraliza las etiquetas sin alterar el resto del texto', () => {
        expect(limpiar('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        // Contraseñas, direcciones y URLs no deben cambiar
        expect(limpiar("Calle 10 # 5/20 & O'Brien \"apto\"")).toBe("Calle 10 # 5/20 & O'Brien \"apto\"");
    });

    it('recorre objetos y listas anidados y respeta lo que no es texto', () => {
        expect(limpiar({ a: ['<b>', 3, null, true], b: { c: '>' } })).toEqual({ a: ['&lt;b&gt;', 3, null, true], b: { c: '&gt;' } });
    });
});
