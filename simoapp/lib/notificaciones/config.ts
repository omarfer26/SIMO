// Centro de notificaciones — Configuración por variables de entorno.
//
// Mismo estilo que el resto del proyecto (se lee directo de process.env, sin
// capa de configuración). Las variables son NEXT_PUBLIC_* porque el navegador
// es quien decide si sondea y si avisa.
//
//   NEXT_PUBLIC_ALERTAS_STOCK                 "false" apaga el vigilante de
//                                             inventario (no sondea, no dispara
//                                             Toasts automáticos). Por defecto
//                                             está encendido.
//   NEXT_PUBLIC_ALERTAS_STOCK_INTERVALO_MIN   Cada cuántos minutos se revalida
//                                             el catálogo contra el backend para
//                                             detectar cambios hechos por otra
//                                             caja u otro usuario. 0 lo desactiva.
//                                             Defecto: 5.
//
// OJO: Next.js solo reemplaza en el bundle del navegador las lecturas ESCRITAS
// LITERALMENTE (process.env.NEXT_PUBLIC_ALERTAS_STOCK). Con un acceso dinámico
// tipo process.env[clave] la variable llegaría undefined en el cliente, así que
// aquí no se usa una función genérica de lectura.

function limpiar(valor: string | undefined): string | undefined {
  if (valor === undefined) return undefined;
  const recortado = valor.trim();
  return recortado.length > 0 ? recortado : undefined;
}

export const ALERTAS_STOCK_ACTIVAS =
  limpiar(process.env.NEXT_PUBLIC_ALERTAS_STOCK) !== "false";

/** Tope inferior: por debajo de 15 s el sondeo sería spam contra el backend. */
const MINUTO_MS = 60 * 1000;
const INTERVALO_MINIMO_MS = 15 * 1000;

/**
 * Intervalo de revalidación en milisegundos. `null` = no hay sondeo periódico
 * (configurado con 0, con un valor inválido, o cuando el valor está por debajo
 * del mínimo) y las alertas siguen saliendo con solo moverse el catálogo en
 * memoria, por ejemplo al cerrar una venta.
 */
export const INTERVALO_REVALIDACION_MS: number | null = (() => {
  const crudo = limpiar(process.env.NEXT_PUBLIC_ALERTAS_STOCK_INTERVALO_MIN);
  if (crudo === undefined) return 5 * MINUTO_MS;

  const minutos = Number(crudo);
  if (!Number.isFinite(minutos) || minutos <= 0) return null;

  return Math.max(Math.round(minutos * MINUTO_MS), INTERVALO_MINIMO_MS);
})();

/** Cuánto dura el "Posponer" del Banner de stock mínimo (30 minutos). */
export const POSPUESTO_BANNER_MS = 30 * MINUTO_MS;

/**
 * A partir de cuántos productos cambiaron de estado en un mismo barrido se
 * manda un solo Toast resumen en lugar de uno por producto. Con catálogo chico
 * se ve el detalle; con 40 productos cayendo a la vez, un aviso de 40 sirve
 * más que 40 avisos.
 */
export const AGRUPAR_DESDE = 3;
