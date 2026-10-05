// SCRUM-loginMejora (Camilo) — Validaciones de los formularios de login y de crear
// usuario. Se ejecutan en el navegador ANTES de enviar al backend, para
// avisarle al usuario de inmediato. No reemplazan la validación del backend
// (esa la hace el equipo de backend): solo evitan viajes innecesarios.
//
// Cada función devuelve un objeto { campo: "mensaje" } solo con los campos
// que tienen error. Si el objeto queda vacío, el formulario es válido.

import type { CodigoRol, CredencialesLogin, DatosNuevoUsuario } from "./tipos";

// Mismo mínimo que exige el backend en POST /api/users.
export const PASSWORD_MINIMO = 8;

// Misma expresión que usa el backend: algo@algo.algo, sin espacios.
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ROLES: { value: CodigoRol; label: string }[] = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GERENTE", label: "Propietario / Gerente" },
  { value: "VENDEDOR", label: "Vendedor" },
  { value: "INVENTARIO", label: "Encargado de Inventario" },
];

export type Errores<Campos extends string> = Partial<Record<Campos, string>>;

function errorCorreo(correo: string): string | undefined {
  if (!correo.trim()) return "Escribe el correo electrónico.";
  if (!REGEX_CORREO.test(correo.trim())) {
    return "El correo no tiene un formato válido. Ejemplo: nombre@empresa.com";
  }
  return undefined;
}

function errorPassword(password: string): string | undefined {
  if (!password) return "Escribe la contraseña.";
  if (password.length < PASSWORD_MINIMO) {
    return `La contraseña debe tener al menos ${PASSWORD_MINIMO} caracteres.`;
  }
  return undefined;
}

// Quita del resultado los campos que no tienen error.
function soloConError<Campos extends string>(
  errores: Record<Campos, string | undefined>,
): Errores<Campos> {
  const resultado: Errores<Campos> = {};
  for (const campo in errores) {
    const mensaje = errores[campo];
    if (mensaje) resultado[campo] = mensaje;
  }
  return resultado;
}

export function validarLogin(
  datos: CredencialesLogin,
): Errores<keyof CredencialesLogin> {
  return soloConError({
    correo: errorCorreo(datos.correo),
    password: errorPassword(datos.password),
  });
}

// El formulario de crear usuario tiene un campo extra que no se envía al
// backend: la confirmación de la contraseña.
export type CamposNuevoUsuario = keyof DatosNuevoUsuario | "confirmarPassword";

export function validarNuevoUsuario(
  datos: Omit<DatosNuevoUsuario, "rol"> & {
    rol: CodigoRol | "";
    confirmarPassword: string;
  },
): Errores<CamposNuevoUsuario> {
  let confirmarPassword: string | undefined;
  if (!datos.confirmarPassword) {
    confirmarPassword = "Vuelve a escribir la contraseña.";
  } else if (datos.confirmarPassword !== datos.password) {
    confirmarPassword = "Las contraseñas no coinciden.";
  }

  return soloConError({
    nombreCompleto: datos.nombreCompleto.trim()
      ? undefined
      : "Escribe el nombre completo.",
    correo: errorCorreo(datos.correo),
    usuario: datos.usuario.trim()
      ? /\s/.test(datos.usuario.trim())
        ? "El nombre de usuario no puede tener espacios."
        : undefined
      : "Escribe un nombre de usuario.",
    rol: datos.rol ? undefined : "Selecciona un rol.",
    password: errorPassword(datos.password),
    confirmarPassword,
  });
}
