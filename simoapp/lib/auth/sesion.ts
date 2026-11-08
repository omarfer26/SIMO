// SCRUM-loginMejora (Camilo) — Único lugar donde se guarda, se lee y se borra la
// sesión. Antes cada archivo lo hacía a su manera (el login escribía
// cookies, pero el Navbar y apiClient usaban localStorage), y por eso
// "Cerrar sesión" no cerraba nada. La sesión vive en dos cookies, que es lo
// que lee middleware.ts para proteger las rutas:
//   - token: el JWT que devuelve el backend.
//   - role:  el código del rol (ADMIN, GERENTE, INVENTARIO, VENDEDOR).
//
// SCRUM-21 (Camilo) — Se agregó una tercera cookie, `userId` (el id del
// usuario que inició sesión). La usa /usuarios para que el Administrador no
// pueda desactivarse ni quitarse el rol a sí mismo. No da ningún permiso:
// quien decide qué puede hacer cada uno es el token, en el backend.

import { borrarCanastaGuardada } from "@/lib/ventas/canastaGuardada";
import type { SesionIniciada } from "./tipos";

// El backend firma el JWT con 8 horas de vida; la cookie dura lo mismo.
const DURACION_SEGUNDOS = 8 * 60 * 60;

function escribirCookie(nombre: string, valor: string, maxAge: number) {
  document.cookie = `${nombre}=${encodeURIComponent(valor)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function leerCookie(nombre: string): string | null {
  if (typeof document === "undefined") return null;
  const par = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${nombre}=`));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : null;
}

export function guardarSesion(sesion: SesionIniciada) {
  escribirCookie("token", sesion.token, DURACION_SEGUNDOS);
  escribirCookie("role", sesion.usuario.rol, DURACION_SEGUNDOS);
  escribirCookie("userId", String(sesion.usuario.id), DURACION_SEGUNDOS);
}

export function cerrarSesion() {
  escribirCookie("token", "", 0);
  escribirCookie("role", "", 0);
  escribirCookie("userId", "", 0);
  // Restos de la versión anterior del login, que guardaba en localStorage.
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  // SCRUM-121 (Camilo) — La canasta del POS que haya quedado guardada es de
  // quien está saliendo: se borra para que el siguiente no la vea.
  borrarCanastaGuardada();
}

export function leerToken(): string | null {
  return leerCookie("token");
}

// SCRUM-21 (Camilo) — Id del usuario con sesión abierta, o null si no se
// sabe (por ejemplo, una sesión que se abrió antes de este cambio).
export function leerIdUsuario(): number | null {
  const id = Number(leerCookie("userId"));
  return Number.isInteger(id) && id > 0 ? id : null;
}
