"use client";

// SCRUM-122 (Camilo) — Hook que dice si el navegador tiene conexión a la red.
// Escucha los eventos "online" y "offline" que el navegador dispara solo
// cuando se cae o vuelve el Wi-Fi/cable, y lee navigator.onLine para saber
// el estado actual. Cualquier componente que lo use se vuelve a pintar
// automáticamente cuando la conexión cambia.
//
// Ojo: navigator.onLine solo sabe si el equipo está conectado a una red, no
// si esa red de verdad sale a internet (por ejemplo, un Wi-Fi sin datos
// cuenta como "conectado"). Es lo que pide el ticket: eventos del navegador.

import { useSyncExternalStore } from "react";

function suscribirse(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

const leerEnLinea = () => navigator.onLine;

// En el servidor no hay navegador: se asume "en línea" para no mostrar el
// aviso rojo por un instante en cada carga. Ya en el navegador, React lo
// corrige con el valor real.
const leerEnLineaServidor = () => true;

export function useConexion(): boolean {
  return useSyncExternalStore(suscribirse, leerEnLinea, leerEnLineaServidor);
}
