// SCRUM-107 (Camilo) — Tipos para el Shell (Navbar + Sidebar): la empresa que
// se muestra en el Navbar, el usuario de sesión que arma el menú de usuario,
// y la forma de cada ítem de navegación del Sidebar.

import type { ReactNode } from "react";

export type RolUsuario =
  | "Administrador"
  | "Propietario"
  | "Vendedor"
  | "Encargado de Inventario";

export interface Empresa {
  razonSocial: string;
  nit: string;
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
