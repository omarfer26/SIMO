// Dashboard Operacional — Paleta y etiquetas de las clasificaciones de
// rotación. Se comparten entre el gráfico y la tabla para que un producto de
// "alta rotación" tenga el mismo color y el mismo texto en los dos lados.

import type { BadgeVariant } from "@/components/ui/Badge";
import type { ClasificacionRotacion } from "@/lib/dashboard/tipos";

export const ETIQUETA_ROTACION: Record<ClasificacionRotacion, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  sin_movimiento: "Sin movimiento",
};

export const COLOR_ROTACION: Record<ClasificacionRotacion, string> = {
  alta: "#10b981",
  media: "#f59e0b",
  baja: "#0ea5e9",
  sin_movimiento: "#a1a1aa",
};

export const VARIANTE_ROTACION: Record<ClasificacionRotacion, BadgeVariant> = {
  alta: "success",
  media: "warning",
  baja: "info",
  sin_movimiento: "default",
};

export const ORDEN_ROTACION: ClasificacionRotacion[] = [
  "alta",
  "media",
  "baja",
  "sin_movimiento",
];

// Los nombres largos del catálogo no caben en el eje del gráfico.
export function recortar(texto: string, maximo = 22): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}
