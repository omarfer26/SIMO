// SCRUM-125 (Camilo) — Tipos de los pedidos que se listan en /pedidos.
// Siguen la tabla `pedidos` (backend/db/migrations/004_clientes_pedidos.sql),
// pero con nombres en camelCase como el resto del front, y con el nombre del
// cliente y de quien lo registró ya resueltos (no solo sus ids).

// Mismos códigos que acepta el backend (CHECK de la columna `estado`).
// Orden del ciclo (RN-04): REGISTRADO → CONFIRMADO → EN_PREPARACION →
// LISTO → ENTREGADO; CANCELADO desde cualquiera antes de ENTREGADO.
export type EstadoPedido =
  | "REGISTRADO"
  | "CONFIRMADO"
  | "EN_PREPARACION"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADO";

export const NOMBRES_ESTADO: Record<EstadoPedido, string> = {
  REGISTRADO: "Registrado",
  CONFIRMADO: "Confirmado",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

// Secuencia progresiva estándar del ciclo de vida del pedido
export const CICLO_PROGRESIVO: EstadoPedido[] = [
  "REGISTRADO",
  "CONFIRMADO",
  "EN_PREPARACION",
  "LISTO",
  "ENTREGADO",
];

// Matriz de transiciones permitidas según regla de negocio (RN-04):
// Un pedido cancelado o entregado ya no avanza. Puede cancelarse desde cualquier estado previo a ENTREGADO.
export const TRANSICIONES_VALIDAS: Record<EstadoPedido, EstadoPedido[]> = {
  REGISTRADO: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["LISTO", "CANCELADO"],
  LISTO: ["ENTREGADO", "CANCELADO"],
  ENTREGADO: [],
  CANCELADO: [],
};

export interface Pedido {
  id: number;
  cliente: string;
  /** Usuario que registró el pedido (columna id_usuario). */
  registradoPor: string;
  estado: EstadoPedido;
  /** Cuándo se hizo el pedido. Es la fecha que usa el filtro Desde/Hasta. */
  fechaSolicitud: Date;
  fechaEntregaPactada: Date;
  total: number;
}
