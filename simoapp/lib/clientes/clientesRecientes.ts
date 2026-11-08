// SCRUM-123 (Camilo) — Los últimos clientes elegidos en el POS de este
// equipo, para mostrarlos como "frecuentes" apenas se abre el modal, sin
// tener que escribir. El backend no tiene un endpoint de clientes frecuentes,
// así que se guardan en el navegador (localStorage), como la canasta de
// SCRUM-121. Si el navegador bloquea el almacenamiento, simplemente no hay
// recientes.

import type { Cliente } from "./tipos";

const CLAVE = "simo.pos.clientesRecientes";
export const MAXIMO_RECIENTES = 5;

function esCliente(valor: unknown): valor is Cliente {
  const c = valor as Cliente;
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "number" &&
    typeof c.documento === "string" &&
    typeof c.nombre === "string"
  );
}

export function leerClientesRecientes(): Cliente[] {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(guardado) ? guardado.filter(esCliente).slice(0, MAXIMO_RECIENTES) : [];
  } catch {
    return [];
  }
}

/** Lo pone de primero; si ya estaba, lo mueve arriba con sus datos nuevos. */
export function recordarCliente(cliente: Cliente): void {
  try {
    const otros = leerClientesRecientes().filter((c) => c.id !== cliente.id);
    localStorage.setItem(CLAVE, JSON.stringify([cliente, ...otros].slice(0, MAXIMO_RECIENTES)));
  } catch {
    // Almacenamiento bloqueado o lleno: no pasa nada, solo no se recuerda.
  }
}
