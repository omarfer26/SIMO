// SCRUM-loginMejora (Camilo) — Puerta única hacia el backend para login y creación
// de usuarios. Los formularios llaman a iniciarSesion() y crearUsuario() sin
// saber si detrás hay una API real o el mock.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: crear simoapp/.env.local con
//   NEXT_PUBLIC_AUTH_MOCK=false
//   NEXT_PUBLIC_API_URL=http://localhost:<puerto-del-backend>/api
// y reiniciar `npm run dev`. Mientras esa variable no sea "false" se usa el
// mock, porque el backend de la rama back-end todavía no arranca.
//
// PENDIENTE DE CONFIRMAR CON BACKEND (ver camilo-sanchez.md):
//  - Si el login recibe `email` (así está hoy) o `correo`.
//  - Los id de cada rol: acá se asume el orden en que los inserta la
//    migración 002_seguridad.sql (no existe un endpoint que los liste).

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import { crearUsuarioMock, iniciarSesionMock } from "./authService.mock";
import {
  ErrorAuth,
  type CodigoRol,
  type CredencialesLogin,
  type DatosNuevoUsuario,
  type SesionIniciada,
  type TipoErrorAuth,
  type UsuarioCreado,
} from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_AUTH_MOCK !== "false";

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
    case "datos_invalidos":
      return error.message || "Hay datos inválidos. Revisa el formulario.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo en unos minutos.";
    case "servidor":
      return "El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.";
  }
}
