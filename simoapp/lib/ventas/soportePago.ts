// SCRUM-73 (Camilo) — Reglas del soporte de pagos digitales (Nequi,
// Daviplata y Transferencia): qué métodos lo piden, qué archivos se aceptan
// como comprobante y cómo se valida el código de referencia. Lo usan el
// modal "Confirmar venta" del POS y "Convertir en venta" de /pedidos, a
// través del componente SoportePagoDigital.
//
// El pago sigue siendo solo informativo (RF-15, fuera de alcance la
// conciliación bancaria): el código y el comprobante sirven para que el
// gerente o la auditoría puedan revisar después que el pago sí llegó.

import type { CodigoMetodoPago } from "./tipos";

/** Métodos en los que el cliente recibe un comprobante con número de referencia. */
export const METODOS_CON_SOPORTE: CodigoMetodoPago[] = ["NEQUI", "DAVIPLATA", "TRANSFERENCIA"];

export function requiereSoporte(metodo: CodigoMetodoPago | null): boolean {
  return metodo !== null && METODOS_CON_SOPORTE.includes(metodo);
}

/** Lo que se le pasa al servicio al confirmar. `comprobante` es el archivo
 *  tal cual lo eligió el vendedor (o null: es opcional). */
export interface SoportePago {
  referencia: string;
  comprobante: File | null;
}

/** Lo que queda guardado en el historial: solo los datos del archivo, no el
 *  archivo, porque el almacenamiento del navegador no alcanza para PDFs. */
export interface SoportePagoGuardado {
  referencia: string;
  comprobante: { nombre: string; tipo: string; tamano: number } | null;
}

export function resumirSoporte(soporte: SoportePago): SoportePagoGuardado {
  return {
    referencia: soporte.referencia,
    comprobante: soporte.comprobante
      ? {
          nombre: soporte.comprobante.name,
          tipo: soporte.comprobante.type,
          tamano: soporte.comprobante.size,
        }
      : null,
  };
}

// --- Comprobante (imagen o PDF) -----------------------------------------

/** Lo que entiende el selector de archivos del navegador (atributo accept). */
export const ACEPTA_COMPROBANTE = "image/jpeg,image/png,image/webp,application/pdf";
const TIPOS_PERMITIDOS = ACEPTA_COMPROBANTE.split(",");
/** 5 MB: alcanza de sobra para un pantallazo o un PDF de una página. */
export const TAMANO_MAXIMO_COMPROBANTE = 5 * 1024 * 1024;

/** Devuelve el mensaje de error, o null si el archivo sirve. */
export function validarComprobante(archivo: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return "Solo se aceptan imágenes (JPG, PNG o WEBP) o PDF.";
  }
  if (archivo.size === 0) return "El archivo está vacío. Elige otro.";
  if (archivo.size > TAMANO_MAXIMO_COMPROBANTE) {
    return `El archivo pesa ${formatoTamano(archivo.size)}; el máximo es ${formatoTamano(TAMANO_MAXIMO_COMPROBANTE)}.`;
  }
  return null;
}

export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// --- Código de referencia ------------------------------------------------

export const LARGO_MINIMO_REFERENCIA = 4;
export const LARGO_MAXIMO_REFERENCIA = 40;

/** Quita espacios de los extremos y deja un solo espacio entre palabras. */
export function normalizarReferencia(texto: string): string {
  return texto.trim().replace(/\s+/g, " ");
}

/** Obligatorio con Nequi, Daviplata y Transferencia. Letras, números,
 *  espacios y - _ . / (así vienen en los comprobantes de los bancos). */
export function validarReferencia(texto: string): string | undefined {
  const referencia = normalizarReferencia(texto);
  if (!referencia) return "Escribe el código de referencia del comprobante.";
  if (referencia.length < LARGO_MINIMO_REFERENCIA) {
    return `El código debe tener al menos ${LARGO_MINIMO_REFERENCIA} caracteres.`;
  }
  if (referencia.length > LARGO_MAXIMO_REFERENCIA) {
    return `El código puede tener máximo ${LARGO_MAXIMO_REFERENCIA} caracteres.`;
  }
  if (!/^[A-Za-z0-9 _./-]+$/.test(referencia)) {
    return "Usa solo letras, números, espacios y los signos - _ . /";
  }
  return undefined;
}
