// HU-15 — Log de Auditoría. Formateo para mostrar en pantalla.
//
// Funciones puras (mismo molde que lib/reportes/formato.ts): reciben un dato
// crudo y devuelven el texto que se ve. Las fechas se formatean en la hora
// local del navegador con Intl (nunca con toISOString(), que daría el día en
// UTC y correría la fecha un día).

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
});

/** Fecha y hora del registro ("08 nov 2026, 3:45 p. m."). */
export function formatoFechaHoraAuditoria(fecha: Date): string {
  return formatoFechaHora.format(fecha);
}

/** Solo la hora, para la celda de la tabla ("3:45 p. m."). */
export function formatoHoraAuditoria(fecha: Date): string {
  return formatoHora.format(fecha);
}

/**
 * Valor legible de un campo del snapshot (JSONB). Los objetos/arreglos salen
 * como JSON compacto; los booleanos como Sí/No; los vacíos como "—".
 */
export function formatoValorSnapshot(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}
