// Centro de notificaciones — Tipos del sistema de avisos en pantalla.
//
// Una Notificacion es un dato, no un componente: se arma en `lib/` (con las
// funciones puras de cola.ts y mensajes.ts) y solo se pinta en
// components/ui/Toast.tsx. Así el mismo aviso puede salir como Toast flotante,
// quedar guardado en la Campana del Navbar o resumirse en el Banner, sin
// duplicar el texto ni la lógica.

/** Qué tan grave es el aviso. Determina el color, el ícono y cuánto dura en pantalla. */
export type VarianteNotificacion = "info" | "exito" | "aviso" | "critico";

/** De dónde vino. Sirve para agrupar y para decir la fuente en pantalla. */
export type OrigenNotificacion = "inventario" | "pos" | "sistema";

/** Enlace de acción del Toast (por ejemplo "Ver inventario" → /catalogo). */
export interface AccionNotificacion {
  etiqueta: string;
  href: string;
}

export interface Notificacion {
  id: string;
  variante: VarianteNotificacion;
  titulo: string;
  detalle: string | null;
  origen: OrigenNotificacion;
  /** Epoch ms en que se creó. Para el "hace 2 min" de la Campana. */
  creada: number;
  /** Epoch ms en que se cierra sola; null = se queda hasta que la cierren. */
  venceEn: number | null;
  /**
   * Clave de duplicados. Si llega otra notificación con la misma clave no se
   * apila un Toast nuevo: se refresca el que ya está y se suma `veces`. Sin
   * esto, revalidar el catálogo con 30 productos bajos de mínimo inundaría
   * la pantalla de avisos iguales.
   */
  clave: string | null;
  /** Veces que se reportó el mismo aviso (se muestra como "×3"). */
  veces: number;
  /** Si ya la vio el panel de la Campana. Marca el punto rojo del ícono. */
  leida: boolean;
  accion: AccionNotificacion | null;
}

/** Lo que pide quien dispara el aviso. El provider completa id, fechas y contadores. */
export interface NotificacionNueva {
  variante: VarianteNotificacion;
  titulo: string;
  origen: OrigenNotificacion;
  detalle?: string | null;
  /** null = no se cierra sola. Si se omite, se usa DURACION_POR_VARIANTE. */
  duracionMs?: number | null;
  clave?: string | null;
  accion?: AccionNotificacion | null;
}

// Critico y aviso duran más: hablan de inventario y hay que leerlos con calma.
export const DURACION_POR_VARIANTE: Record<VarianteNotificacion, number> = {
  info: 6000,
  exito: 5000,
  aviso: 9000,
  critico: 14000,
};

/** Cuántos Toasts se apilan como máximo; el más viejo sale de la vista. */
export const LIMITE_COLA = 5;

/** Cada cuántos milisegundos se revisa si algo venció (cola.ts / provider). */
export const TICK_VENCIMIENTO_MS = 1000;

/**
 * Orden de gravedad, de más a menos. Se usa para desempatar la pila de Toasts
 * y para listar los productos del Banner (los agotados primero).
 */
export const ORDEN_VARIANTE: Record<VarianteNotificacion, number> = {
  critico: 0,
  aviso: 1,
  exito: 2,
  info: 3,
};

export const ETIQUETA_VARIANTE: Record<VarianteNotificacion, string> = {
  critico: "Crítico",
  aviso: "Atención",
  exito: "Listo",
  info: "Información",
};

export const ETIQUETA_ORIGEN: Record<OrigenNotificacion, string> = {
  inventario: "Inventario",
  pos: "Punto de venta",
  sistema: "Sistema",
};
