// SCRUM-50 (Camilo) — Tipos del módulo de Ventas (POS): la línea de la
// canasta, los métodos de pago y lo que se le manda al backend al confirmar
// una venta.

import type { Producto } from "@/components/catalogo/tipos";

// Una línea de la canasta del POS: qué producto y cuántas unidades. Antes
// estaba definido dentro de app/(protected)/ventas/page.tsx; se movió acá
// porque ahora también lo usa el modal de confirmación.
export interface ItemCanasta {
  producto: Producto;
  cantidad: number;
}

// Códigos de la tabla `metodos_pago` (backend/db/migrations/005_ventas.sql,
// rama back-end). El método es solo informativo (RF-15): no hay
// integración bancaria ni conciliación automática con Nequi/Daviplata.
export type CodigoMetodoPago =
  | "EFECTIVO"
  | "NEQUI"
  | "DAVIPLATA"
  | "TRANSFERENCIA"
  | "TARJETA"
  | "OTRO";

export interface MetodoPago {
  codigo: CodigoMetodoPago;
  nombre: string;
  descripcion: string;
}

// Mismo orden y nombres que inserta la migración 005. No existe un endpoint
// que los liste; si algún día se agrega (GET /api/payment-methods), esta
// lista se puede reemplazar por la respuesta del backend.
export const METODOS_PAGO: MetodoPago[] = [
  { codigo: "EFECTIVO", nombre: "Efectivo", descripcion: "Billetes y monedas" },
  { codigo: "NEQUI", nombre: "Nequi", descripcion: "Transferencia a Nequi" },
  { codigo: "DAVIPLATA", nombre: "Daviplata", descripcion: "Transferencia a Daviplata" },
  { codigo: "TRANSFERENCIA", nombre: "Transferencia bancaria", descripcion: "Desde cualquier banco" },
  { codigo: "TARJETA", nombre: "Tarjeta débito/crédito", descripcion: "Datáfono" },
  { codigo: "OTRO", nombre: "Otro", descripcion: "Cualquier otro medio" },
];

// Lo que el POS le manda al servicio de ventas al confirmar.
export interface DatosVenta {
  metodoPago: CodigoMetodoPago;
  /** SCRUM-123 (Camilo) — id_cliente; null = Consumidor final. */
  idCliente: number | null;
  items: ItemCanasta[];
  subtotal: number;
  descuento: number;
  impuestos: number;
  total: number;
}

// Lo que responde el servicio cuando la venta quedó registrada.
export interface VentaRegistrada {
  idVenta: number;
  fecha: string;
  total: number;
}
