// Centro de notificaciones — Formatos de texto para los avisos.
//
// Repite el patrón de lib/dashboard/formato.ts (es-CO) para que las
// cantidades de stock se escriban igual en el Toast, el Banner y la Campana.
// El stock es NUMERIC(12,3) en PostgreSQL, así que admite decimales.

export const formatoUnidades = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

export const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * "ahora", "hace 40 s", "hace 3 min", "hace 2 h" para la lista de la Campana.
 *
 * Se trabaja con la diferencia en milisegundos sobre `ahora`, sin armar fechas
 * por cadena ni usar toISOString() (que corre el día por trabajar en UTC).
 */
export function tiempoRelativo(creada: number, ahora: number = Date.now()): string {
  const segundos = Math.max(0, Math.round((ahora - creada) / 1000));
  if (segundos < 45) return "ahora";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} d`;
}

/** "3 de 5" — cuánto quedó y cuál era el mínimo, para el detalle del aviso. */
export function textoStock(restante: number, minimo: number): string {
  return `${formatoUnidades.format(restante)} de ${formatoUnidades.format(minimo)}`;
}
