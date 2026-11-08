// src/utils/fechas.js
// Fechas que llegan en la URL o en el cuerpo de las peticiones.
// La empresa opera en Colombia (UTC-5, sin horario de verano).
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T/;

// Convierte AAAA-MM-DD (hora de Colombia, al inicio o al final del día) o una
// fecha y hora ISO 8601 a Date.
//   null      -> el parámetro no vino (o vino vacío)
//   undefined -> el valor no es una fecha válida
function aInstante(valor, finDelDia = false) {
    if (valor === undefined || valor === null || valor === '') return null;
    if (typeof valor !== 'string') return undefined;
    if (REGEX_FECHA.test(valor)) {
        // Rechaza días que no existen (2026-02-30), que Date convertiría al mes siguiente
        const [a, m, d] = valor.split('-').map(Number);
        const calendario = new Date(Date.UTC(a, m - 1, d));
        if (calendario.getUTCFullYear() !== a || calendario.getUTCMonth() !== m - 1 || calendario.getUTCDate() !== d) {
            return undefined;
        }
        return new Date(`${valor}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}-05:00`);
    }
    const d = new Date(valor);
    return REGEX_FECHA_HORA.test(valor) && !Number.isNaN(d.getTime()) ? d : undefined;
}

module.exports = { aInstante };
