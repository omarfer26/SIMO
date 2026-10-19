// SCRUM-loginMejora (Camilo) — Único lugar donde se guarda, se lee y se borra la
// sesión. Antes cada archivo lo hacía a su manera (el login escribía
// cookies, pero el Navbar y apiClient usaban localStorage), y por eso
// "Cerrar sesión" no cerraba nada. La sesión vive en dos cookies, que es lo
// que lee middleware.ts para proteger las rutas:
//   - token: el JWT que devuelve el backend.
//   - role:  el código del rol (ADMIN, GERENTE, INVENTARIO, VENDEDOR).

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
}

export function cerrarSesion() {
  escribirCookie("token", "", 0);
  escribirCookie("role", "", 0);
  // Limpieza completa de LocalStorage y SessionStorage del cliente
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("usuario");
    localStorage.removeItem("user");
    localStorage.removeItem("auth");
    sessionStorage.clear();
  }
}

export function leerToken(): string | null {
  return leerCookie("token");
}
