// Dashboard Operacional — Formatos compartidos por las tarjetas y los
// gráficos. Se centralizan acá para que el eje, el tooltip y la tabla
// muestren la misma moneda y las mismas fechas (es-CO, pesos sin centavos).

export const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export const formatoNumero = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

export const formatoDecimal = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
});

export const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
});

// Etiqueta de la serie semanal: "Sem. 05 oct".
export function etiquetaSemana(inicio: Date): string {
  return `Sem. ${formatoFechaCorta.format(inicio)}`;
}

// Los montos se escriben en pesos sin centavos; en el eje no caben, así que
// se abrevian a miles ("$120 k") o a millones ("$1,2 M").
export function formatearEjeMoneda(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto >= 1_000_000) {
    return `$${(valor / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  }
  if (absoluto >= 1000) {
    return `$${(valor / 1000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} k`;
  }
  return `$${formatoNumero.format(valor)}`;
}

// "12,4 %" con signo solo cuando se muestra una variación.
export function formatearPorcentaje(valor: number, opciones?: { conSigno?: boolean }): string {
  const texto = `${valor.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
  if (!opciones?.conSigno) return texto;
  if (valor > 0) return `+${texto}`;
  return texto;
}

// Índice de rotación con dos decimales y la "x" de veces.
export function formatearIndice(valor: number): string {
  return `${formatoDecimal.format(valor)}x`;
}
