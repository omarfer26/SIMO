// SCRUM-loginMejora (Camilo) — Backend "de mentiras" para login y creación de
// usuarios. Existe porque el backend real (rama back-end) todavía no arranca
// y su contrato no está cerrado. Imita las mismas respuestas y los mismos
// errores (401, 403, 409) para poder probar y mostrar los formularios.
//
// SOLO PARA DESARROLLO Y DEMO: los usuarios se guardan en el localStorage
// del navegador, con la contraseña en texto plano. Nada de esto se usa
// cuando NEXT_PUBLIC_AUTH_MOCK=false (ver authService.ts).

import {
  ErrorAuth,
  type CodigoRol,
  type CredencialesLogin,
  type DatosNuevoUsuario,
  type SesionIniciada,
  type UsuarioCreado,
} from "./tipos";

interface UsuarioMock extends UsuarioCreado {
  password: string;
  activo: boolean;
}

const CLAVE_STORAGE = "simo.mock.usuarios";
const DEMORA_MS = 700;

// Los mismos usuarios de prueba que crea el backend en
// backend/db/seeds/001_datos_desarrollo.sql, más uno inactivo para poder
// probar el mensaje de "cuenta inactiva".
const PASSWORD_SEMILLA = "Simo2026*";
const semilla: [CodigoRol, string, string, string, boolean][] = [
  ["ADMIN", "Administrador SIMO", "admin@simo.local", "admin", true],
  ["GERENTE", "Gerente SIMO", "gerente@simo.local", "gerente", true],
  ["INVENTARIO", "Encargado Inventario", "inventario@simo.local", "inventario", true],
  ["VENDEDOR", "Vendedor SIMO", "vendedor@simo.local", "vendedor", true],
  ["VENDEDOR", "Usuario Inactivo", "inactivo@simo.local", "inactivo", false],
];

function usuariosIniciales(): UsuarioMock[] {
  return semilla.map(([rol, nombreCompleto, correo, usuario, activo], i) => ({
    id: i + 1,
    rol,
    nombreCompleto,
    correo,
    usuario,
    activo,
    password: PASSWORD_SEMILLA,
  }));
}

function leerUsuarios(): UsuarioMock[] {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    if (guardado) return JSON.parse(guardado) as UsuarioMock[];
  } catch {
    // localStorage bloqueado o con datos dañados: se arranca de la semilla.
  }
  return usuariosIniciales();
}

function guardarUsuarios(usuarios: UsuarioMock[]) {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(usuarios));
  } catch {
    // Sin localStorage el usuario nuevo solo dura hasta recargar la página.
  }
}

function esperar() {
  return new Promise((resolve) => setTimeout(resolve, DEMORA_MS));
}

export async function iniciarSesionMock(
  credenciales: CredencialesLogin,
): Promise<SesionIniciada> {
  await esperar();
  const correo = credenciales.correo.trim().toLowerCase();
  const usuario = leerUsuarios().find((u) => u.correo === correo);

  if (!usuario || usuario.password !== credenciales.password) {
    throw new ErrorAuth("credenciales", "Credenciales inválidas.");
  }
  if (!usuario.activo) {
    throw new ErrorAuth("cuenta_inactiva", "La cuenta de usuario se encuentra inactiva.");
  }

  return {
    token: `mock.${btoa(`${usuario.id}:${usuario.rol}:${Date.now()}`)}`,
    usuario: { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
  };
}

export async function crearUsuarioMock(
  datos: DatosNuevoUsuario,
): Promise<UsuarioCreado> {
  await esperar();
  const usuarios = leerUsuarios();
  const correo = datos.correo.trim().toLowerCase();
  const nombreUsuario = datos.usuario.trim();

  if (usuarios.some((u) => u.correo === correo || u.usuario === nombreUsuario)) {
    throw new ErrorAuth(
      "duplicado",
      "Ya existe un usuario con ese correo o nombre de usuario.",
    );
  }

  const nuevo: UsuarioMock = {
    id: Math.max(0, ...usuarios.map((u) => u.id)) + 1,
    nombreCompleto: datos.nombreCompleto.trim(),
    correo,
    usuario: nombreUsuario,
    rol: datos.rol,
    password: datos.password,
    activo: true,
  };
  guardarUsuarios([...usuarios, nuevo]);

  return {
    id: nuevo.id,
    nombreCompleto: nuevo.nombreCompleto,
    correo: nuevo.correo,
    usuario: nuevo.usuario,
    rol: nuevo.rol,
  };
}
