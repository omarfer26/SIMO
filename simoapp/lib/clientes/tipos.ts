// SCRUM-123 (Camilo) — Tipos de los clientes que se eligen en el POS. Siguen
// la tabla `clientes` (backend/db/migrations/004_clientes_pedidos.sql) y la
// respuesta de /api/customers de la rama feature/SCRUM-98-gestion-clientes
// (Ramón), pero con nombres en camelCase como el resto del front.

// Mismos códigos que acepta el backend (CHECK de la columna
// tipo_identificacion). CC es el que usa por defecto.
export type TipoDocumento = "CC" | "CE" | "NIT" | "TI" | "PAS";

export const TIPOS_DOCUMENTO: { value: TipoDocumento; label: string }[] = [
  { value: "CC", label: "Cédula de ciudadanía" },
  { value: "NIT", label: "NIT" },
  { value: "CE", label: "Cédula de extranjería" },
  { value: "TI", label: "Tarjeta de identidad" },
  { value: "PAS", label: "Pasaporte" },
];

export interface Cliente {
  id: number;
  tipoDocumento: TipoDocumento;
  /** Normalizado: sin puntos ni espacios, letras en mayúscula. */
  documento: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  activo: boolean;
}

// Lo que escribe el cajero en "Registrar cliente nuevo". Los opcionales
// van como texto ("" = vacío), tal como salen del formulario.
export interface DatosClienteNuevo {
  tipoDocumento: TipoDocumento;
  documento: string;
  nombre: string;
  telefono: string;
  correo: string;
  direccion: string;
}
