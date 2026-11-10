"use client";

// Rol de la sesión abierta, para los componentes que muestran u ocultan cosas
// según la matriz de lib/auth/permisos.ts.
//
// El rol vive en la cookie `role` (lib/auth/sesion.ts), que no existe en el
// servidor. Por eso se lee con useSyncExternalStore: en el HTML inicial (y en
// la hidratación) el rol es null, y React vuelve a pintar con el valor real
// apenas el componente está en el navegador. Leerlo dentro de un useEffect con
// setState está prohibido por el lint (react-hooks/set-state-in-effect) y
// además encadena un render de más; y leerlo directo durante el render
// rompería la hidratación.

import { useSyncExternalStore } from "react";
import { leerNombreUsuario, leerRol } from "./sesion";
import type { CodigoRol } from "./tipos";

// La cookie solo cambia al iniciar o cerrar sesión, y eso recarga la página
// (window.location.href en login y en "Cerrar sesión"): no hay nada a lo que
// suscribirse, pero useSyncExternalStore exige una función estable.
const SIN_SUSCRIPCION = () => () => {};

// En el servidor no hay cookies que leer: null hasta hidratar.
const SIN_ROL_EN_SERVIDOR = () => null;

export function useRolSesion(): CodigoRol | null {
  return useSyncExternalStore(SIN_SUSCRIPCION, leerRol, SIN_ROL_EN_SERVIDOR);
}

// (Camilo, 2026-11-10) — Nombre del usuario de la sesión (cookie `userName`),
// con la misma técnica que el rol: null hasta hidratar.
export function useNombreSesion(): string | null {
  return useSyncExternalStore(SIN_SUSCRIPCION, leerNombreUsuario, SIN_ROL_EN_SERVIDOR);
}
