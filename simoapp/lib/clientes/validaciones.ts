// SCRUM-123 (Camilo) — Validaciones del formulario "Registrar cliente nuevo"
// del POS. Copian las reglas del backend de Ramón (clientes.controller.js,
// rama feature/SCRUM-98-gestion-clientes) para avisarle al cajero antes de
// enviar. No reemplazan la validación del backend.

import type { Errores } from "@/lib/auth/validaciones";
import type { DatosClienteNuevo } from "./tipos";

const REGEX_DOCUMENTO = /^[0-9A-Z-]{3,30}$/;
const REGEX_TELEFONO = /^[0-9+()\s-]{7,30}$/;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Igual que el backend: "1.090.123 456" → "1090123456"; letras en mayúscula
// (pasaportes, NIT con letra). Así se guarda y así se compara.
export function normalizarDocumento(valor: string): string {
  return valor.replace(/[.\s]/g, "").toUpperCase();
}

// Para mostrar: 1090123456 → 1.090.123.456 y 900123456-7 → 900.123.456-7.
// Si tiene letras (pasaporte), se deja tal cual.
export function formatoDocumento(documento: string): string {
  const [numero, verificacion] = documento.split("-");
  if (!/^\d+$/.test(numero)) return documento;
  const conPuntos = numero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return verificacion !== undefined ? `${conPuntos}-${verificacion}` : conPuntos;
}

// Si lo que escribió el cajero en el buscador parece un documento (solo
// números, puntos, espacios o guion), para pasarlo al formulario de registro.
export function pareceDocumento(texto: string): boolean {
  return /^[0-9.\s-]+$/.test(texto.trim()) && /\d/.test(texto);
}

export type CampoClienteNuevo = keyof DatosClienteNuevo;

export function validarClienteNuevo(datos: DatosClienteNuevo): Errores<CampoClienteNuevo> {
  const errores: Errores<CampoClienteNuevo> = {};

  const documento = normalizarDocumento(datos.documento);
  if (!documento) {
    errores.documento = "Escribe el número de documento.";
  } else if (!REGEX_DOCUMENTO.test(documento)) {
    errores.documento = "Debe tener entre 3 y 30 caracteres: números, letras o guion.";
  }

  const nombre = datos.nombre.trim();
  if (!nombre) errores.nombre = "Escribe el nombre o la razón social.";
  else if (nombre.length > 150) errores.nombre = "Máximo 150 caracteres.";

  const telefono = datos.telefono.trim();
  if (telefono && !REGEX_TELEFONO.test(telefono)) {
    errores.telefono = "Entre 7 y 30 caracteres: números, espacios, +, - o paréntesis.";
  }

  const correo = datos.correo.trim();
  if (correo && (correo.length > 150 || !REGEX_CORREO.test(correo))) {
    errores.correo = "El correo no tiene un formato válido. Ejemplo: nombre@correo.com";
  }

  if (datos.direccion.trim().length > 200) errores.direccion = "Máximo 200 caracteres.";

  return errores;
}
