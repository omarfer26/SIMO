// Consola de descargas de reportes — Formateo para mostrar en pantalla.
//
// Funciones puras (mismo molde que lib/dashboard/formato.ts y
// lib/notificaciones/formato.ts): reciben un dato crudo y devuelven el texto
// que se ve, sin tocar React ni el DOM. Las fechas se formatean en la hora
// local del navegador con Intl (nunca con toISOString(), que daría el día en
// UTC y correría la fecha un día).

/** Convierte bytes a un texto legible ("1,2 MB", "845 KB", "512 B"). */
export function formatoTamanoArchivo(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  // Sin decimales para bytes ni para valores de dos cifras ("12 MB"); uno para
  // el resto ("1,2 MB").
  const decimales = i === 0 || valor >= 10 ? 0 : 1;
  return `${valor.toLocaleString("es-CO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} ${unidades[i]}`;
}

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Fecha de generación en texto corto ("08 nov 2026"). */
export function formatoFechaReporte(fecha: Date): string {
  return formatoFecha.format(fecha);
}

/** Fecha de generación con hora ("08 nov 2026, 3:45 p. m."). */
export function formatoFechaHoraReporte(fecha: Date): string {
  return formatoFechaHora.format(fecha);
}
