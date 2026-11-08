// SCRUM-124 (Camilo) — Validaciones del formulario de traslado Bodega →
// Almacén. Se revisan en el navegador para avisar de inmediato; el backend
// las debe repetir, porque el stock pudo cambiar mientras tanto (RNF-04).

import type { Errores } from "@/lib/auth/validaciones";

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

  const cantidad = Number(campos.cantidadTexto);
  if (campos.cantidadTexto.trim() === "") {
    errores.cantidad = "Escribe cuántas unidades vas a trasladar.";
  } else if (!Number.isFinite(cantidad) || cantidad <= 0) {
    errores.cantidad = "La cantidad debe ser mayor que 0.";
  } else if (!permiteDecimales(unidadMedida) && !Number.isInteger(cantidad)) {
    errores.cantidad = `Este producto se maneja por ${unidadMedida.toLowerCase()}: usa un número entero.`;
  } else if (!/^\d+(\.\d{1,3})?$/.test(campos.cantidadTexto.trim())) {
    // Por texto y no con cantidad * 1000: 1.005 * 1000 da 1004.9999999.
    errores.cantidad = "Máximo 3 decimales.";
  } else if (cantidad > stockBodega) {
    errores.cantidad = `Solo hay ${stockBodega} en Bodega.`;
  }

  if (campos.idResponsable === null) {
    errores.responsable = "Elige quién entrega la mercancía.";
  }

  const justificacion = campos.justificacion.trim();
  if (justificacion.length < JUSTIFICACION_MINIMA) {
    errores.justificacion = `Explica el motivo del traslado (mínimo ${JUSTIFICACION_MINIMA} caracteres).`;
  } else if (justificacion.length > JUSTIFICACION_MAXIMA) {
    errores.justificacion = `Máximo ${JUSTIFICACION_MAXIMA} caracteres.`;
  }

  if (!campos.firmado) {
    errores.firma = "El responsable debe confirmar el traslado.";
  }

  return errores;
}
