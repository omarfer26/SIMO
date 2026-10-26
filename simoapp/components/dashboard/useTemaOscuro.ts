"use client";

// Dashboard Operacional — ¿el sistema operativo está en modo oscuro?
// globals.css cambia los colores con `prefers-color-scheme`, pero los
// gráficos de Recharts se dibujan con atributos SVG (relleno, trazo), no con
// clases de Tailwind: necesitan saber el tema para pintar ejes y grillas con
// el contraste correcto.
//
// Se usa useSyncExternalStore (y no un useEffect con setState) porque la
// media query es una fuente de datos externa a React: así se lee sin
// provocar renders en cascada y el servidor tiene su propio valor inicial
// (claro), sin diferencias de hidratación.

import { useSyncExternalStore } from "react";

const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

function suscribir(alCambiar: () => void) {
  const consulta = window.matchMedia(CONSULTA_OSCURO);
  consulta.addEventListener("change", alCambiar);
  return () => consulta.removeEventListener("change", alCambiar);
}

function leerEnNavegador(): boolean {
  return window.matchMedia(CONSULTA_OSCURO).matches;
}

function leerEnServidor(): boolean {
  return false;
}

export function useTemaOscuro(): boolean {
  return useSyncExternalStore(suscribir, leerEnNavegador, leerEnServidor);
}
