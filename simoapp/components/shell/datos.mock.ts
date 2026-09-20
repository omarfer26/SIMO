// SCRUM-107 (Camilo) — Datos de prueba para el Shell. El módulo de Seguridad
// (login, sesión real, datos de la empresa) todavía no existe, así que el
// Navbar usa esta empresa y este usuario "de mentiras" mientras tanto. Cuando
// haya login real, esto debería reemplazarse por los datos de la sesión
// autenticada (ver limitación documentada en camilo-sanchez.md).

import type { Empresa, UsuarioSesion } from "./tipos";

export const empresaMock: Empresa = {
  razonSocial: "Comercial San Andresito",
  nit: "900123456-7",
};

export const usuarioMock: UsuarioSesion = {
  nombre: "Laura Gómez",
  rol: "Encargado de Inventario",
};
