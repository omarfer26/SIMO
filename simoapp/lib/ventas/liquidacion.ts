// SCRUM-50 (Camilo) — Cálculo y validación de la "liquidación" de una venta
// (subtotal, descuento, total y, si paga en efectivo, el cambio). Son
// funciones puras, sin React: reciben números y devuelven números o
// mensajes, así se pueden reutilizar y probar sin abrir la pantalla.
//
// Los precios de venta ya incluyen IVA (lo normal en retail), así que
// `impuestos` siempre es 0 y total = subtotal − descuento. Es la misma
// regla que exige la tabla `ventas` del backend:
//   total = subtotal − descuento + impuestos, y descuento <= subtotal.

import type { CodigoMetodoPago, ItemCanasta } from "./tipos";

export interface Liquidacion {
  subtotal: number;
  descuento: number;
  impuestos: number;
  total: number;
  /** Solo en efectivo: lo que se le devuelve al cliente (nunca negativo). */
  cambio: number;
  /** Solo en efectivo: lo que falta si lo recibido no alcanza. */
  faltante: number;
}

// Redondea a pesos enteros: el COP no maneja centavos en la práctica y así
// el total que se muestra es exactamente el que se guarda.
const aPesos = (valor: number) => Math.round(valor);

export function calcularLiquidacion(
  items: ItemCanasta[],
  descuento: number,
  recibido: number,
): Liquidacion {
  const subtotal = aPesos(
    items.reduce((suma, item) => suma + item.producto.precioVenta * item.cantidad, 0),
  );
  // Un descuento inválido (negativo o mayor que el subtotal) no se aplica al
  // total; el error se muestra aparte con validarLiquidacion.
  const descuentoAplicado =
    descuento > 0 && descuento <= subtotal ? aPesos(descuento) : 0;
  const total = subtotal - descuentoAplicado;

  return {
    subtotal,
    descuento: descuentoAplicado,
    impuestos: 0,
    total,
    cambio: Math.max(0, aPesos(recibido) - total),
    faltante: Math.max(0, total - aPesos(recibido)),
  };
}

export interface ErroresLiquidacion {
  metodoPago?: string;
  descuento?: string;
  recibido?: string;
}

// `descuentoTexto` y `recibidoTexto` llegan tal como están escritos en el
// campo (texto), para poder distinguir "vacío" de "0".
export function validarLiquidacion({
  metodoPago,
  descuentoTexto,
  recibidoTexto,
  subtotal,
  total,
}: {
  metodoPago: CodigoMetodoPago | null;
  descuentoTexto: string;
  recibidoTexto: string;
  subtotal: number;
  total: number;
}): ErroresLiquidacion {
  const errores: ErroresLiquidacion = {};

  if (!metodoPago) {
    errores.metodoPago = "Elige cómo paga el cliente.";
  }

  if (descuentoTexto.trim() !== "") {
    const descuento = Number(descuentoTexto);
    if (!Number.isFinite(descuento) || descuento < 0) {
      errores.descuento = "El descuento debe ser un valor en pesos, 0 o mayor.";
    } else if (descuento > subtotal) {
      errores.descuento = "El descuento no puede ser mayor que el subtotal.";
    }
  }

  if (metodoPago === "EFECTIVO") {
    const recibido = Number(recibidoTexto);
    if (recibidoTexto.trim() === "") {
      errores.recibido = "Escribe con cuánto paga el cliente.";
    } else if (!Number.isFinite(recibido) || recibido < total) {
      errores.recibido = "Lo recibido no alcanza para el total.";
    }
  }

  return errores;
}

// Botones rápidos para el efectivo: "exacto" y los billetes redondos más
// cercanos por encima del total (por ejemplo, para $37.500: $40.000,
// $50.000 y $100.000). Se quitan los repetidos y los iguales al total.
export function sugerenciasEfectivo(total: number): number[] {
  const redondeos = [10_000, 50_000, 100_000].map(
    (billete) => Math.ceil(total / billete) * billete,
  );
  const unicos = [...new Set(redondeos)].filter((valor) => valor > total);
  return [total, ...unicos].slice(0, 4);
}
