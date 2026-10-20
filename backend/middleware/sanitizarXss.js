// middleware/sanitizarXss.js
// Sanitización contra XSS (SCRUM-127), compatible con Express 5.
//
// Reemplaza al paquete xss-clean, que ya no se mantiene y en Express 5 hace
// fallar TODAS las peticiones con "Cannot set property query of
// #<IncomingMessage> which has only a getter" (en Express 5 req.query es un
// getter de solo lectura).
//
// Hace lo mismo que xss-clean: en cada texto recibido (body, query y params)
// reemplaza "<" y ">" por sus entidades HTML, para que no se pueda inyectar
// código que luego se muestre en el navegador.

function limpiarTexto(valor) {
    return valor.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function limpiar(valor) {
    if (typeof valor === 'string') return limpiarTexto(valor);
    if (Array.isArray(valor)) return valor.map(limpiar);
    if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
        const resultado = {};
        for (const [clave, interno] of Object.entries(valor)) resultado[clave] = limpiar(interno);
        return resultado;
    }
    return valor;
}

function sanitizarXss(req, res, next) {
    if (req.body) req.body = limpiar(req.body);
    if (req.params) req.params = limpiar(req.params);
    // En Express 5 req.query es un getter: se define una propiedad propia en
    // la petición con la versión limpia, en lugar de reasignar la original.
    const query = limpiar(req.query);
    Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true });
    next();
}

module.exports = { sanitizarXss, limpiar };
