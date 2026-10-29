// SCRUM-57 (Camilo) — Validaciones del formulario "Nuevo pedido". Son las
// mismas que hace el backend en POST /api/orders (pedidos.controller.js),
// revisadas en el navegador para avisar antes de enviar.

import type { Errores } from "@/lib/auth/validaciones";
import { errorCantidad } from "@/lib/inventario/validaciones";
import type { CodigoMetodoPago } from "@/lib/ventas/tipos";

export const MAXIMO_LINEAS = 100;
export const DIRECCION_MAXIMA = 200;
export const OBSERVACIONES_MAXIMA = 1000;

export type CampoPedido = "cliente" | "lineas" | "fechaEntrega" | "direccion" | "observaciones";

export interface CamposPedido {
  idCliente: number | null;
  lineas: { idProducto: number; cantidadTexto: string; unidadMedida: string }[];
  fechaEntrega: string;
  direccion: string;
  observaciones: string;
}

export interface ResultadoValidacionPedido {
  errores: Errores<CampoPedido>;
  /** Error de la cantidad de cada línea, por id de producto. */
  erroresCantidad: Record<number, string>;
}

// Fecha de hoy en hora local como AAAA-MM-DD, el formato de <input type="date">.
// (toISOString() daría la fecha en UTC: después de las 7 p. m. en Colombia ya
// sería "mañana".)
export function hoyComoTexto(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

export function errorCantidadLinea(cantidadTexto: string, unidadMedida: string): string | undefined {
  return errorCantidad(cantidadTexto, unidadMedida, "pedir");
}

export function validarPedido(campos: CamposPedido): ResultadoValidacionPedido {
  const errores: Errores<CampoPedido> = {};
  const erroresCantidad: Record<number, string> = {};

  if (campos.idCliente === null) errores.cliente = "Elige el cliente que hace el pedido.";

  if (campos.lineas.length === 0) {
    errores.lineas = "Agrega al menos un producto.";
  } else if (campos.lineas.length > MAXIMO_LINEAS) {
    errores.lineas = `Un pedido admite máximo ${MAXIMO_LINEAS} productos distintos.`;
  }
  for (const linea of campos.lineas) {
    const error = errorCantidadLinea(linea.cantidadTexto, linea.unidadMedida);
    if (error) erroresCantidad[linea.idProducto] = error;
  }

  // Las dos fechas son AAAA-MM-DD, así que se pueden comparar como texto.
  if (!campos.fechaEntrega) {
    errores.fechaEntrega = "Elige la fecha en que se le entrega al cliente.";
  } else if (campos.fechaEntrega < hoyComoTexto()) {
    errores.fechaEntrega = "La fecha de entrega no puede estar en el pasado.";
  }

  if (campos.direccion.trim().length > DIRECCION_MAXIMA) {
    errores.direccion = `Máximo ${DIRECCION_MAXIMA} caracteres.`;
  }
  if (campos.observaciones.trim().length > OBSERVACIONES_MAXIMA) {
    errores.observaciones = `Máximo ${OBSERVACIONES_MAXIMA} caracteres.`;
  }

  return { errores, erroresCantidad };
}

// SCRUM-59 (Camilo) — Validación de "Convertir en venta" (HU-12). Las mismas
// reglas que revisa el backend (fn_convertir_pedido_en_venta): método de
// pago obligatorio y descuento entre 0 y el total del pedido. Los mensajes
// son los del POS (lib/ventas/liquidacion.ts).
export type CampoConversion = "metodoPago" | "descuento";

export function validarConversion({
  metodoPago,
  descuentoTexto,
  totalPedido,
}: {
  metodoPago: CodigoMetodoPago | null;
  descuentoTexto: string;
  totalPedido: number;
}): Errores<CampoConversion> {
  const errores: Errores<CampoConversion> = {};
  if (!metodoPago) errores.metodoPago = "Elige cómo pagó el cliente.";
  if (descuentoTexto.trim() !== "") {
    const descuento = Number(descuentoTexto);
    if (!Number.isFinite(descuento) || descuento < 0) {
      errores.descuento = "El descuento debe ser un valor en pesos, 0 o mayor.";
    } else if (descuento > totalPedido) {
      errores.descuento = "El descuento no puede ser mayor que el total del pedido.";
    }
  }
  return errores;
}
