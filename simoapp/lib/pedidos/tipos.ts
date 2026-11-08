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
