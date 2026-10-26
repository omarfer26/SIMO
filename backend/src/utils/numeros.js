// src/utils/numeros.js
// Números que llegan en el cuerpo de las peticiones.

// Acepta números o texto numérico ("12.5"); rechaza vacíos, NaN e infinitos.
function aNumero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
    if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
    return NaN;
}

// true si el número tiene más de `maximo` decimales (tolera el error binario
// de punto flotante y la notación científica, p. ej. 1e-7).
function excedeDecimales(numero, maximo) {
    const escalado = numero * 10 ** maximo;
    return Math.abs(escalado - Math.round(escalado)) > 1e-6;
}

const REGEX_ENTERO_POSITIVO = /^[1-9]\d*$/;

module.exports = { aNumero, excedeDecimales, REGEX_ENTERO_POSITIVO };
