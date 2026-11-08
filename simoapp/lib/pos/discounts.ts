// Utils para descuentos en POS

export type DescuentoTipo = "porcentaje" | "valor";

export interface Descuento {
  tipo: DescuentoTipo;
  valor: number;
  descripcion?: string;
}

export interface ItemCarrito {
  id: number | string;
  nombre: string;
  precio: number; // en centavos
  cantidad: number;
  descuento?: Descuento | null;
}

export function calcularDescuentoItem(item: ItemCarrito): { descuentoMonto: number; totalNeto: number } {
  const bruto = item.precio * item.cantidad;
  if (!item.descuento) return { descuentoMonto: 0, totalNeto: bruto };

  const d = item.descuento;
  if (d.tipo === "porcentaje") {
    const porcentaje = Math.max(0, Math.min(100, d.valor));
    const descuentoMonto = Math.round((bruto * porcentaje) / 100);
    return { descuentoMonto, totalNeto: Math.max(0, bruto - descuentoMonto) };
  } else {
    const descuentoMonto = Math.min(Math.max(0, Math.round(d.valor)), bruto);
    return { descuentoMonto, totalNeto: Math.max(0, bruto - descuentoMonto) };
  }
}

export function calcularTotalesCarrito(items: ItemCarrito[], descuentoGlobal?: Descuento | null) {
  const itemsConCifras = items.map((it) => {
    const { descuentoMonto, totalNeto } = calcularDescuentoItem(it);
    return { ...it, bruto: it.precio * it.cantidad, descuentoMonto, totalNeto };
  });

  const subtotal = itemsConCifras.reduce((s, it) => s + it.bruto, 0);
  const descuentoItemsTotal = itemsConCifras.reduce((s, it) => s + it.descuentoMonto, 0);
  const subtotalDespuesItems = Math.max(0, subtotal - descuentoItemsTotal);

  let descuentoGlobalMonto = 0;
  if (descuentoGlobal) {
    if (descuentoGlobal.tipo === "porcentaje") {
      const porcentaje = Math.max(0, Math.min(100, descuentoGlobal.valor));
      descuentoGlobalMonto = Math.round((subtotalDespuesItems * porcentaje) / 100);
    } else {
      descuentoGlobalMonto = Math.min(Math.max(0, Math.round(descuentoGlobal.valor)), subtotalDespuesItems);
    }
  }

  const totalDescuentos = descuentoItemsTotal + descuentoGlobalMonto;
  const totalPagar = Math.max(0, subtotal - totalDescuentos);

  return {
    items: itemsConCifras,
    subtotal,
    descuentoItemsTotal,
    descuentoGlobalMonto,
    totalDescuentos,
    totalPagar,
  };
}
