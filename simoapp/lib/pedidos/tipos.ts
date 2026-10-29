// SCRUM-125 (Camilo) — Tipos de los pedidos que se listan en /pedidos.
// Siguen la tabla `pedidos` (backend/db/migrations/004_clientes_pedidos.sql),
// pero con nombres en camelCase como el resto del front, y con el nombre del
// cliente y de quien lo registró ya resueltos (no solo sus ids).

import type { CodigoMetodoPago } from "@/lib/ventas/tipos";

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
  /** SCRUM-59 (Camilo) — Venta en la que se convirtió el pedido ya entregado
   *  (HU-12); null = todavía no se ha convertido. */
  idVenta: number | null;
}

// SCRUM-57 (Camilo) — Lo que se manda al registrar un pedido nuevo desde el
// formulario "Nuevo pedido". Sigue el cuerpo de POST /api/orders (rama
// back-end, SCRUM-81 de Ramón). El pedido siempre nace REGISTRADO.
export interface LineaPedidoNueva {
  idProducto: number;
  cantidad: number;
  /** Solo lo usa el mock para calcular el total: el backend usa el precio
   *  de venta vigente del producto, no el que mande el front. */
  precioUnitario: number;
}

export interface DatosPedidoNuevo {
  idCliente: number;
  /** Solo lo usa el mock (el backend lo saca del JOIN con clientes). */
  nombreCliente: string;
  /** AAAA-MM-DD. El backend lo pacta para el final de ese día (hora de Colombia). */
  fechaEntregaPactada: string;
  /** "" = sin dirección. */
  direccionEntrega: string;
  /** "" = sin observaciones. */
  observaciones: string;
  lineas: LineaPedidoNueva[];
}

export interface PedidoRegistrado {
  pedido: Pedido;
  /** El backend avisa si hoy no alcanza el stock de algún producto. No
   *  impide registrar: el stock se descuenta al pasar a EN_PREPARACION. */
  advertencia: string | null;
}

// SCRUM-59 (Camilo) — Conversión de un pedido ENTREGADO en venta (HU-12).
// Sigue POST /api/orders/:id/convert-to-sale (rama back-end, SCRUM-62 de
// Ramón): la venta toma el cliente, los productos y los precios del pedido.
export interface DatosConversionVenta {
  metodoPago: CodigoMetodoPago;
  /** En pesos; 0 = sin descuento. */
  descuento: number;
}

export interface VentaDePedido {
  idVenta: number;
  idPedido: number;
  descuento: number;
  /** Lo que se cobró: total del pedido − descuento. */
  total: number;
  /** Nombre legible del método ("Nequi"), para el aviso de éxito. */
  metodoPago: string;
}
