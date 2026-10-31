// Centro de notificaciones — "Posponer" del Banner de stock mínimo.
//
// Guarda en localStorage hasta qué momento el usuario pidió que no le vuelva
// el banner. Es el mismo criterio de lib/ventas/canastaGuardada.ts: todas las
// funciones atrapan el error, porque en una ventana privada o con el
// almacenamiento bloqueado el sistema de avisos tiene que seguir funcionando
// igual (solo que la posposición no sobrevive a recargar).

const CLAVE_STORAGE = "simo.notificaciones.bannerStock";

/** Epoch ms hasta el cual el banner está silenciado; null = siempre visible. */
export function leerPospuestoHasta(): number | null {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return null;
    const guardado = Number(crudo);
    return Number.isFinite(guardado) ? guardado : null;
  } catch {
    return null;
  }
}

/**
 * Igual que `leerPospuestoHasta()`, pero un silencio ya vencido se reporta como
 * null: el banner debe aparecer abierto desde el primer render, sin un parpadeo
 * esperando a que un temporizador lo reactive.
 */
export function leerPospuestoVigente(): number | null {
  const hasta = leerPospuestoHasta();
  return hasta !== null && hasta > Date.now() ? hasta : null;
}

/** Devuelve el instante de vencimiento que se guardó (para el estado de React). */
export function posponerBanner(hastaMs: number): number {
  try {
    localStorage.setItem(CLAVE_STORAGE, String(hastaMs));
  } catch {
    // Almacenamiento lleno o bloqueado: se pospone solo mientras dure la sesión.
  }
  return hastaMs;
}

export function reactivarBanner(): void {
  try {
    localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Nada que borrar si el almacenamiento está bloqueado.
  }
}
