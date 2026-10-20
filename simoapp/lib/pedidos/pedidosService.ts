// SCRUM-125 (Camilo) — Puerta única hacia el backend para leer la lista de
// pedidos. La página /pedidos llama a listarPedidos() sin saber si detrás
// está la API real o el mock.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_PEDIDOS_MOCK=false
// y reiniciar `npm run dev`. Mientras no sea "false" se usa el mock, porque
// ninguna rama del backend tiene todavía endpoints de pedidos (revisado el
// 2026-10-18: solo existen las tablas, migración 004).
//
// CONTRATO QUE SE LE PROPONE AL BACKEND (ver camilo-sanchez.md, SCRUM-125):
//   GET /api/orders?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
//     - desde y hasta son opcionales, inclusivos, y filtran por el día de
//       fecha_solicitud en hora de Colombia.
//   Responde 200: { data: [ { id_pedido, nombre_cliente, nombre_usuario,
//                   estado, fecha_solicitud, fecha_entrega_pactada, total } ] }
//   (nombre_cliente y nombre_usuario salen de un JOIN con clientes y
//   usuarios, para no pedir cada nombre aparte.)
// Por ahora el front pide todo y filtra en el navegador (así el filtro es
// instantáneo). Cuando haya muchos pedidos, se mandan desde/hasta.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { EstadoPedido, Pedido } from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_PEDIDOS_MOCK !== "false";

interface FilaPedido {
  id_pedido: number;
  nombre_cliente: string;
  nombre_usuario: string;
  estado: EstadoPedido;
  fecha_solicitud: string;
  fecha_entrega_pactada: string;
  // PostgreSQL manda los NUMERIC como texto ("125000.00").
  total: string | number;
}

function aPedido(fila: FilaPedido): Pedido {
  return {
    id: fila.id_pedido,
    cliente: fila.nombre_cliente,
    registradoPor: fila.nombre_usuario,
    estado: fila.estado,
    fechaSolicitud: new Date(fila.fecha_solicitud),
    fechaEntregaPactada: new Date(fila.fecha_entrega_pactada),
    total: Number(fila.total),
  };
}

export async function listarPedidos(): Promise<Pedido[]> {
  if (USAR_MOCK) return listarPedidosMock();

  const { data } = await apiClient.get("/orders");
  return (data.data as FilaPedido[]).map(aPedido);
}

export function mensajeErrorPedidos(error: unknown): string {
  if (isAxiosError(error) && !error.response) {
    return "No pudimos conectar con el servidor. Revisa la conexión e inténtalo de nuevo.";
  }
  return "El servidor tuvo un problema. Inténtalo de nuevo.";
}

// ---------------------------------------------------------------------
// Mock: pedidos de prueba con fechas contadas desde hoy, para que los
// atajos ("Hoy", "Últimos 7 días", "Este mes") siempre muestren algo.
// ---------------------------------------------------------------------

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

// Fecha de hace `dias` días a la hora indicada (hora local). Nunca queda en
// el futuro: un pedido de "hoy a las 8" visto a las 7 queda con la hora actual.
function haceDias(dias: number, hora: number, minuto = 0): Date {
  const ahora = new Date();
  const fecha = new Date(ahora);
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(hora, minuto, 0, 0);
  return fecha > ahora ? ahora : fecha;
}

function masDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

// [id, cliente, registró, estado, hace cuántos días, hora, días para entregar, total]
const datosMock: [number, string, string, EstadoPedido, number, number, number, number][] = [
  [1001, "María Fernanda López", "Laura Vendedora", "ENTREGADO", 62, 9, 3, 245000],
  [1002, "Distribuidora El Progreso S.A.S.", "Carlos Inventario", "ENTREGADO", 45, 15, 5, 1380000],
  [1003, "Andrés Felipe Gómez", "Laura Vendedora", "CANCELADO", 33, 11, 2, 89000],
  [1004, "Juan Sebastián Rincón", "Laura Vendedora", "ENTREGADO", 21, 10, 4, 312500],
  [1005, "Papelería La Esquina", "Carlos Inventario", "ENTREGADO", 14, 16, 3, 540000],
  [1006, "Sandra Milena Ortiz", "Laura Vendedora", "LISTO", 9, 8, 6, 178000],
  [1007, "María Fernanda López", "Carlos Inventario", "EN_PREPARACION", 6, 14, 4, 96500],
  [1008, "Ferretería Don Jaime", "Laura Vendedora", "CONFIRMADO", 4, 10, 5, 725000],
  [1009, "Andrés Felipe Gómez", "Laura Vendedora", "CANCELADO", 3, 17, 2, 60000],
  [1010, "Distribuidora El Progreso S.A.S.", "Carlos Inventario", "REGISTRADO", 2, 9, 7, 2150000],
  [1011, "Sandra Milena Ortiz", "Laura Vendedora", "CONFIRMADO", 1, 12, 3, 134000],
  [1012, "Juan Sebastián Rincón", "Carlos Inventario", "REGISTRADO", 0, 8, 2, 47900],
];

async function listarPedidosMock(): Promise<Pedido[]> {
  await esperar(500);
  return datosMock.map(([id, cliente, registradoPor, estado, dias, hora, entrega, total]) => {
    const fechaSolicitud = haceDias(dias, hora, (id * 7) % 60);
    return {
      id,
      cliente,
      registradoPor,
      estado,
      fechaSolicitud,
      fechaEntregaPactada: masDias(fechaSolicitud, entrega),
      total,
    };
  });
}
