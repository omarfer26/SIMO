// Gestor pasivo de expiración de sesión y cola de reintentos
// Permite recuperar la sesión mediante modal reactivo sin recargar la página
// ni perder el estado o formulario activo en pantalla (cajero, pedidos, administración).

type SuscriptorExpiracion = () => void;
type SuscriptorExito = () => void;

let suscriptoresExpiracion: SuscriptorExpiracion[] = [];
let suscriptoresExito: SuscriptorExito[] = [];

/**
 * Suscribe un callback cuando se detecta que el token ha expirado (401 pasivo o timeout).
 */
export function suscribirExpiracionSesion(fn: SuscriptorExpiracion): () => void {
  suscriptoresExpiracion.push(fn);
  return () => {
    suscriptoresExpiracion = suscriptoresExpiracion.filter((s) => s !== fn);
  };
}

/**
 * Suscribe un callback que se invoca cuando la sesión fue recuperada con éxito.
 */
export function suscribirSesionRecuperada(fn: SuscriptorExito): () => void {
  suscriptoresExito.push(fn);
  return () => {
    suscriptoresExito = suscriptoresExito.filter((s) => s !== fn);
  };
}

/**
 * Dispara el aviso pasivo de expiración de sesión para abrir el modal.
 */
export function notificarSesionExpirada() {
  suscriptoresExpiracion.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("Error notificando expiración de sesión:", e);
    }
  });
}

/**
 * Notifica que la sesión fue restaurada para reintentar peticiones o cerrar el modal.
 */
export function notificarSesionRecuperada() {
  suscriptoresExito.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("Error notificando sesión recuperada:", e);
    }
  });
}
