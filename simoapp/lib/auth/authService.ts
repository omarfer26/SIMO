// SCRUM-loginMejora (Camilo) — Puerta única hacia el backend para login y creación
// de usuarios. Los formularios llaman a iniciarSesion() y crearUsuario() sin
// saber si detrás hay una API real o el mock.
//
// (Camilo, 2026-10-20) — AHORA SE USA LA API REAL POR DEFECTO: los usuarios
// se guardan en la base de datos del backend, así todos los computadores ven
// los mismos. Antes el mock era lo normal y cada navegador guardaba sus
// propios usuarios en localStorage (por eso un usuario creado en un
// computador no aparecía en otro).
// Para volver al mock (sin backend), en simoapp/.env.local poner
//   NEXT_PUBLIC_AUTH_MOCK=true
// y reiniciar `npm run dev`. La dirección del backend se cambia con
// NEXT_PUBLIC_API_URL (por defecto http://localhost:3000/api, ver
// lib/apiClient.ts).
//
// PENDIENTE DE CONFIRMAR CON BACKEND (ver camilo-sanchez.md):
//  - Si el login recibe `email` (así está hoy) o `correo`.
//  - Los id de cada rol: acá se asume el orden en que los inserta la
//    migración 002_seguridad.sql (no existe un endpoint que los liste).
//  - SCRUM-21: editar usuario y cambiar su estado todavía no existen en el
//    backend. Se propone PUT /api/users/:id y PATCH /api/users/:id/estado
//    (ver editarUsuario y cambiarEstadoUsuario, más abajo).

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import {
  cambiarEstadoUsuarioMock,
  crearUsuarioMock,
  editarUsuarioMock,
  iniciarSesionMock,
  listarUsuariosMock,
} from "./authService.mock";
import {
  ErrorAuth,
  type CodigoRol,
  type CredencialesLogin,
  type DatosEdicionUsuario,
  type DatosNuevoUsuario,
  type SesionIniciada,
  type TipoErrorAuth,
  type UsuarioCreado,
  type UsuarioListado,
} from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_AUTH_MOCK === "true";

const ID_ROL: Record<CodigoRol, number> = {
  ADMIN: 1,
  GERENTE: 2,
  INVENTARIO: 3,
  VENDEDOR: 4,
};

// Convierte cualquier fallo de Axios en un ErrorAuth. `porEstado` dice qué
// significa cada código HTTP para la operación que se estaba haciendo (un
// 401 en el login son credenciales malas; al crear usuario es falta de
// permiso).
function aErrorAuth(
  error: unknown,
  porEstado: Partial<Record<number, TipoErrorAuth>>,
): ErrorAuth {
  if (error instanceof ErrorAuth) return error;
  if (!isAxiosError(error)) {
    return new ErrorAuth("servidor", "Error inesperado.");
  }
  if (!error.response) {
    return new ErrorAuth("sin_conexion", error.message);
  }
  const mensajeBackend: unknown = error.response.data?.message;
  return new ErrorAuth(
    porEstado[error.response.status] ?? "servidor",
    typeof mensajeBackend === "string" ? mensajeBackend : error.message,
  );
}

export async function iniciarSesion(
  credenciales: CredencialesLogin,
): Promise<SesionIniciada> {
  if (USAR_MOCK) return iniciarSesionMock(credenciales);

  try {
    const { data } = await apiClient.post("/auth/login", {
      email: credenciales.correo.trim().toLowerCase(),
      password: credenciales.password,
    });
    return {
      token: data.token,
      usuario: {
        id: data.user.id,
        correo: data.user.email,
        rol: data.user.rol,
      },
    };
  } catch (error) {
    throw aErrorAuth(error, {
      400: "datos_invalidos",
      401: "credenciales",
      403: "cuenta_inactiva",
    });
  }
}

export async function crearUsuario(
  datos: DatosNuevoUsuario,
): Promise<UsuarioCreado> {
  if (USAR_MOCK) return crearUsuarioMock(datos);

  try {
    const { data } = await apiClient.post("/users", {
      id_rol: ID_ROL[datos.rol],
      nombre_completo: datos.nombreCompleto.trim(),
      correo: datos.correo.trim().toLowerCase(),
      usuario: datos.usuario.trim(),
      password: datos.password,
    });
    return {
      id: data.usuario.id_usuario,
      nombreCompleto: data.usuario.nombre_completo,
      correo: data.usuario.correo,
      usuario: data.usuario.usuario,
      rol: data.usuario.rol_codigo,
    };
  } catch (error) {
    throw aErrorAuth(error, {
      400: "datos_invalidos",
      401: "sin_permiso",
      403: "sin_permiso",
      409: "duplicado",
    });
  }
}

// Forma de cada usuario en la respuesta de GET /api/users (rama back-end).
interface UsuarioApi {
  id_usuario: number;
  nombre_completo: string;
  correo: string;
  usuario: string;
  estado: boolean;
  rol_codigo: CodigoRol;
}

function aUsuarioListado(u: UsuarioApi): UsuarioListado {
  return {
    id: u.id_usuario,
    nombreCompleto: u.nombre_completo,
    correo: u.correo,
    usuario: u.usuario,
    rol: u.rol_codigo,
    activo: u.estado,
  };
}

// Lista de usuarios para la tabla de /usuarios. El backend entrega máximo
// 100 por petición; se pide esa primera página completa y la tabla pagina
// en el navegador. Si algún día hay más de 100 usuarios, habrá que pedir
// las páginas siguientes (la respuesta trae `pagination.totalPages`).
export async function listarUsuarios(): Promise<UsuarioListado[]> {
  if (USAR_MOCK) return listarUsuariosMock();

  try {
    const { data } = await apiClient.get("/users", { params: { limit: 100 } });
    return (data.data as UsuarioApi[]).map(aUsuarioListado);
  } catch (error) {
    throw aErrorAuth(error, { 401: "sin_permiso", 403: "sin_permiso" });
  }
}

// SCRUM-21 (Camilo) — Guarda los cambios del modal "Editar usuario".
// CONTRATO PROPUESTO (el backend todavía no tiene este endpoint):
//   PUT /api/users/:id
//   body: { id_rol, nombre_completo, correo, usuario }   (sin contraseña)
//   200 → { message, usuario: { ...mismas columnas que GET /api/users } }
//   400 dato inválido · 404 no existe · 409 correo/usuario de otro usuario
export async function editarUsuario(
  id: number,
  datos: DatosEdicionUsuario,
): Promise<UsuarioListado> {
  if (USAR_MOCK) return editarUsuarioMock(id, datos);

  try {
    const { data } = await apiClient.put(`/users/${id}`, {
      id_rol: ID_ROL[datos.rol],
      nombre_completo: datos.nombreCompleto.trim(),
      correo: datos.correo.trim().toLowerCase(),
      usuario: datos.usuario.trim(),
    });
    return aUsuarioListado(data.usuario);
  } catch (error) {
    throw aErrorAuth(error, {
      400: "datos_invalidos",
      401: "sin_permiso",
      403: "sin_permiso",
      404: "no_encontrado",
      409: "duplicado",
    });
  }
}

// SCRUM-21 (Camilo) — Activa o desactiva un usuario (no lo borra).
// CONTRATO PROPUESTO (el backend todavía no tiene este endpoint):
//   PATCH /api/users/:id/estado
//   body: { estado: true | false }
//   200 → { message, usuario: { ...mismas columnas que GET /api/users } }
export async function cambiarEstadoUsuario(
  id: number,
  activo: boolean,
): Promise<UsuarioListado> {
  if (USAR_MOCK) return cambiarEstadoUsuarioMock(id, activo);

  try {
    const { data } = await apiClient.patch(`/users/${id}/estado`, {
      estado: activo,
    });
    return aUsuarioListado(data.usuario);
  } catch (error) {
    throw aErrorAuth(error, {
      400: "datos_invalidos",
      401: "sin_permiso",
      403: "sin_permiso",
      404: "no_encontrado",
    });
  }
}

// Texto amigable para mostrarle al usuario según el tipo de error. Para
// "datos_invalidos" se muestra lo que dijo el backend, porque es el único
// que sabe qué campo rechazó.
export function mensajeDeError(error: unknown): string {
  if (!(error instanceof ErrorAuth)) {
    return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  }
  switch (error.tipo) {
    case "credenciales":
      return "Correo o contraseña incorrectos. Revísalos e inténtalo de nuevo.";
    case "cuenta_inactiva":
      return "Tu cuenta está inactiva. Comunícate con el administrador.";
    case "duplicado":
      return "Ya existe un usuario con ese correo o nombre de usuario.";
    case "sin_permiso":
      return "No tienes permiso para hacer esto. Inicia sesión como Administrador.";
    case "no_encontrado":
      return "Ese usuario ya no existe. Recarga la lista.";
    case "datos_invalidos":
      return error.message || "Hay datos inválidos. Revisa el formulario.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo en unos minutos.";
    case "servidor":
      return "El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.";
  }
}
