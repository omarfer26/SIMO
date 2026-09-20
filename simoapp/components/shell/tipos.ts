// SCRUM-107 (Camilo) — Tipos para el Shell (Navbar + Sidebar): la empresa que
// se muestra en el Navbar, el usuario de sesión que arma el menú de usuario,
// y la forma de cada ítem de navegación del Sidebar.

import type { ReactNode } from "react";

export type RolUsuario =
  | "Administrador"
  | "Propietario"
  | "Vendedor"
  | "Encargado de Inventario";

// SCRUM-111 (Camilo) — Empresa ganó teléfono, dirección y logo: los campos
// que captura el formulario de "Parámetros de la Empresa" en /admin. Se
// extendió acá (y no se duplicó en otro archivo) porque el Navbar ya usaba
// este mismo tipo para razonSocial/nit.
export interface Empresa {
  razonSocial: string;
  nit: string;
  telefono: string;
  direccion: string;
  logoUrl: string | null;
}

export interface UsuarioSesion {
  nombre: string;
  rol: RolUsuario;
}

export interface ModuloNav {
  nombre: string;
  href: string;
  icono: ReactNode;
}
