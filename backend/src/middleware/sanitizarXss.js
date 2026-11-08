// src/middleware/sanitizarXss.js
// Reemplaza xss-clean (incompatible con Express 5).
// Recorre recursivamente req.body, req.query y req.params y escapa
// los caracteres HTML peligrosos en todos los valores string.

/**
 * Escapa los caracteres que permiten inyección de HTML/JS.
 * @param {string} valor
 * @returns {string}
 */
function escaparHtml(valor) {
    return valor
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Recorre un objeto/array/primitivo y sanitiza todos los strings.
 * @param {*} dato
 * @returns {*}
 */
function sanitizar(dato) {
    if (typeof dato === 'string') return escaparHtml(dato);
    if (Array.isArray(dato))      return dato.map(sanitizar);
    if (dato !== null && typeof dato === 'object') {
        return Object.fromEntries(
            Object.entries(dato).map(([k, v]) => [k, sanitizar(v)])
        );
    }
    return dato;
}

/**
 * Middleware Express que sanitiza req.body, req.query y req.params.
 */
function sanitizarXss(req, _res, next) {
    if (req.body)   req.body   = sanitizar(req.body);
    if (req.query)  req.query  = sanitizar(req.query);
    if (req.params) req.params = sanitizar(req.params);
    next();
}

module.exports = { sanitizarXss };
