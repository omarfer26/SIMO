// SCRUM-124 (Camilo) — Validaciones del formulario de traslado Bodega →
// Almacén. Se revisan en el navegador para avisar de inmediato; el backend
// las debe repetir, porque el stock pudo cambiar mientras tanto (RNF-04).

import type { Errores } from "@/lib/auth/validaciones";
import type { TipoAjuste, Ubicacion } from "./tipos";

export const JUSTIFICACION_MINIMA = 10;
export const JUSTIFICACION_MAXIMA = 500;

// Las unidades que en la tabla unidades_medida tienen permite_decimales
// (003_catalogo.sql). Las demás (Unidad, Caja, Resma...) van en enteros.
const UNIDADES_CON_DECIMALES = ["kilogramo", "gramo", "litro"];

export function permiteDecimales(unidadMedida: string): boolean {
  return UNIDADES_CON_DECIMALES.includes(unidadMedida.trim().toLowerCase());
}

export interface CamposTraslado {
  cantidadTexto: string;
  idResponsable: number | null;
  justificacion: string;
  firmado: boolean;
}

export type CampoTraslado = "cantidad" | "responsable" | "justificacion" | "firma";

export function validarTraslado(
  campos: CamposTraslado,
  stockBodega: number,
  unidadMedida: string,
): Errores<CampoTraslado> {
  const errores: Errores<CampoTraslado> = {};

  const errorDeCantidad = errorCantidad(campos.cantidadTexto, unidadMedida, "trasladar", {
    valor: stockBodega,
    lugar: "Bodega",
  });
  if (errorDeCantidad) errores.cantidad = errorDeCantidad;

  if (campos.idResponsable === null) {
    errores.responsable = "Elige quién entrega la mercancía.";
  }

  const errorDeJustificacion = errorJustificacion(campos.justificacion, "traslado");
  if (errorDeJustificacion) errores.justificacion = errorDeJustificacion;

  if (!campos.firmado) {
    errores.firma = "El responsable debe confirmar el traslado.";
  }

  return errores;
}

// SCRUM-38 (Camilo) — Revisión de cantidad que antes estaba dentro de
// validarTraslado; ahora la comparten el traslado y el ajuste. `maximo` es
// lo que hay en la ubicación de donde sale la mercancía (si sale de algún lado).
// SCRUM-57 (Camilo) — Exportada: también la usan las líneas de un pedido nuevo.
export function errorCantidad(
  texto: string,
  unidadMedida: string,
  verbo: string,
  maximo?: { valor: number; lugar: string },
): string | undefined {
  const cantidad = Number(texto);
  if (texto.trim() === "") return `Escribe cuántas unidades vas a ${verbo}.`;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return "La cantidad debe ser mayor que 0.";
  if (!permiteDecimales(unidadMedida) && !Number.isInteger(cantidad)) {
    return `Este producto se maneja por ${unidadMedida.toLowerCase()}: usa un número entero.`;
  }
  // Por texto y no con cantidad * 1000: 1.005 * 1000 da 1004.9999999.
  if (!/^\d+(\.\d{1,3})?$/.test(texto.trim())) return "Máximo 3 decimales.";
  if (maximo && cantidad > maximo.valor) return `Solo hay ${maximo.valor} en ${maximo.lugar}.`;
  return undefined;
}

function errorJustificacion(texto: string, operacion: string): string | undefined {
  const justificacion = texto.trim();
  if (justificacion.length < JUSTIFICACION_MINIMA) {
    return `Explica el motivo del ${operacion} (mínimo ${JUSTIFICACION_MINIMA} caracteres).`;
  }
  if (justificacion.length > JUSTIFICACION_MAXIMA) return `Máximo ${JUSTIFICACION_MAXIMA} caracteres.`;
  return undefined;
}

// ---------------------------------------------------------------------
// SCRUM-38 (Camilo) — Validaciones del formulario de ajuste manual de stock.
// La justificación es obligatoria (RF-10): la base también la exige
// (chk_movimiento_motivo_ajuste) y va al log de auditoría.
// ---------------------------------------------------------------------
export interface CamposAjuste {
  tipo: TipoAjuste | null;
  ubicacion: Ubicacion | null;
  cantidadTexto: string;
  justificacion: string;
}

export type CampoAjuste = "tipo" | "ubicacion" | "cantidad" | "justificacion";

export const NOMBRE_UBICACION: Record<Ubicacion, string> = {
  BODEGA: "Bodega",
  ALMACEN: "Almacén",
};

export function validarAjuste(
  campos: CamposAjuste,
  stock: Record<Ubicacion, number>,
  unidadMedida: string,
): Errores<CampoAjuste> {
  const errores: Errores<CampoAjuste> = {};

  if (campos.tipo === null) errores.tipo = "Elige si el ajuste suma o resta stock.";
  if (campos.ubicacion === null) errores.ubicacion = "Elige en qué ubicación se hace el ajuste.";

  // Solo un ajuste negativo tiene tope: no se puede restar más de lo que
  // hay en la ubicación (el saldo no puede quedar negativo en la base).
  const maximo =
    campos.tipo === "AJUSTE_NEGATIVO" && campos.ubicacion !== null
      ? { valor: stock[campos.ubicacion], lugar: NOMBRE_UBICACION[campos.ubicacion] }
      : undefined;
  const errorDeCantidad = errorCantidad(campos.cantidadTexto, unidadMedida, "ajustar", maximo);
  if (errorDeCantidad) errores.cantidad = errorDeCantidad;

  const errorDeJustificacion = errorJustificacion(campos.justificacion, "ajuste");
  if (errorDeJustificacion) errores.justificacion = errorDeJustificacion;

  return errores;
}
