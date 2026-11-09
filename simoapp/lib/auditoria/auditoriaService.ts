// HU-15 — Log de Auditoría Inalterable. Puerta única hacia los datos.
//
// El panel llama a listarAuditoria() sin saber si detrás está la API real o el
// mock, igual que lib/reportes y lib/pedidos.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_AUDITORIA_MOCK=false
// y reiniciar `npm run dev`. Mientras no sea "false" se usa el mock, porque
// todavía no hay endpoint de lectura de auditoría en el backend (la tabla
// log_auditoria sí existe: backend/db/migrations/007_auditoria.sql).
//
// CONTRATO QUE SE LE PROPONE AL BACKEND:
//   GET /api/audit?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&accion=AJUSTE_INVENTARIO
//     - roles ADMIN y GERENTE (ver middleware.ts). Solo lectura: la base bloquea
//       UPDATE/DELETE/TRUNCATE con triggers (RF-24), así que no hay endpoints de
//       escritura acá.
//     - desde/hasta opcionales e inclusivos; filtran por el día de `fecha`.
//     Responde 200: { data: [ { id_log, fecha, nombre_usuario,
//       nombre_autorizador, accion, entidad, id_entidad, justificacion,
//       datos_anteriores, datos_nuevos, direccion_ip } ] }
//       (nombre_usuario y nombre_autorizador salen de un JOIN con usuarios.)
// Por ahora el front pide todo y filtra en el navegador (filtros instantáneos).

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { AccionAuditoria, EntradaAuditoria, Snapshot } from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_AUDITORIA_MOCK !== "false";

// --- Mock: bitácora de operaciones críticas --------------------------------

// Días hacia atrás desde hoy (a una hora fija), para que los atajos del filtro
// de fechas ("Hoy", "Últimos 7 días", "Este mes") recorten la lista de verdad.
function haceDias(dias: number, hora: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(hora, 15, 0, 0);
  return fecha;
}

const AUDITORIA_MOCK: EntradaAuditoria[] = [
  {
    idLog: 1041,
    fecha: haceDias(0, 8),
    usuario: "Diana Ospina",
    autorizador: null,
    accion: "AJUSTE_INVENTARIO",
    entidad: "productos",
    idEntidad: 12,
    justificacion: "Conteo físico: faltante de 3 und en Bodega.",
    datosAnteriores: { stock_bodega: 25, stock_almacen: 8 },
    datosNuevos: { stock_bodega: 22, stock_almacen: 8 },
    direccionIp: "190.12.34.56",
  },
  {
    idLog: 1040,
    fecha: haceDias(0, 11),
    usuario: "Camilo Sánchez",
    autorizador: "Laura Restrepo",
    accion: "ANULACION_VENTA",
    entidad: "ventas",
    idEntidad: 1043,
    justificacion: "Cliente desistió de la compra al momento de pagar.",
    datosAnteriores: { estado: "ACTIVA", total: 125000 },
    datosNuevos: { estado: "ANULADA", total: 125000 },
    direccionIp: "186.84.220.11",
  },
  {
    idLog: 1039,
    fecha: haceDias(1, 15),
    usuario: "Camilo Sánchez",
    autorizador: null,
    accion: "CANCELACION_PEDIDO",
    entidad: "pedidos",
    idEntidad: 218,
    justificacion: "Cliente canceló por demora en la entrega pactada.",
    datosAnteriores: { estado: "CONFIRMADO" },
    datosNuevos: { estado: "CANCELADO" },
    direccionIp: "186.84.220.11",
  },
  {
    idLog: 1038,
    fecha: haceDias(2, 9),
    usuario: "Diana Ospina",
    autorizador: null,
    accion: "AJUSTE_INVENTARIO",
    entidad: "productos",
    idEntidad: 7,
    justificacion: "Merma por daño en empaque dentro de Almacén.",
    datosAnteriores: { stock_almacen: 40 },
    datosNuevos: { stock_almacen: 36 },
    direccionIp: "190.12.34.61",
  },
  {
    idLog: 1037,
    fecha: haceDias(3, 16),
    usuario: "Andrés Molina",
    autorizador: null,
    accion: "CAMBIO_PRECIO",
    entidad: "productos",
    idEntidad: 12,
    justificacion: null,
    datosAnteriores: { precio_venta: 45000 },
    datosNuevos: { precio_venta: 48500 },
    direccionIp: "201.236.118.90",
  },
  {
    idLog: 1036,
    fecha: haceDias(5, 10),
    usuario: "Camilo Sánchez",
    autorizador: "Andrés Molina",
    accion: "ANULACION_VENTA",
    entidad: "ventas",
    idEntidad: 1029,
    justificacion: "Error de registro: producto cobrado por duplicado.",
    datosAnteriores: { estado: "ACTIVA", total: 78000 },
    datosNuevos: { estado: "ANULADA", total: 78000 },
    direccionIp: "186.84.220.14",
  },
  {
    idLog: 1035,
    fecha: haceDias(6, 14),
    usuario: "Andrés Molina",
    autorizador: null,
    accion: "CAMBIO_ROL_USUARIO",
    entidad: "usuarios",
    idEntidad: 9,
    justificacion: null,
    datosAnteriores: { rol: "VENDEDOR" },
    datosNuevos: { rol: "GERENTE" },
    direccionIp: "201.236.118.90",
  },
  {
    idLog: 1034,
    fecha: haceDias(9, 12),
    usuario: "Laura Restrepo",
    autorizador: null,
    accion: "CANCELACION_PEDIDO",
    entidad: "pedidos",
    idEntidad: 205,
    justificacion: "Cliente no confirmó la dirección de entrega.",
    datosAnteriores: { estado: "REGISTRADO" },
    datosNuevos: { estado: "CANCELADO" },
    direccionIp: "190.12.34.70",
  },
  {
    idLog: 1033,
    fecha: haceDias(20, 17),
    usuario: "Andrés Molina",
    autorizador: null,
    accion: "CAMBIO_ESTADO_USUARIO",
    entidad: "usuarios",
    idEntidad: 14,
    justificacion: null,
    datosAnteriores: { activo: true },
    datosNuevos: { activo: false },
    direccionIp: "201.236.118.92",
  },
  {
    idLog: 1032,
    fecha: haceDias(35, 11),
    usuario: "Andrés Molina",
    autorizador: null,
    accion: "ACTUALIZACION_EMPRESA",
    entidad: "empresa",
    idEntidad: 1,
    justificacion: null,
    datosAnteriores: { telefono: "601 745 8899" },
    datosNuevos: { telefono: "601 745 9000", direccion: "Cra 15 #96-42" },
    direccionIp: "201.236.118.90",
  },
];

async function listarAuditoriaMock(): Promise<EntradaAuditoria[]> {
  // Pequeña demora para que se vea el estado de carga (Skeleton), como el mock
  // de reportes/pedidos. Se devuelve una copia para que nadie la mute.
  await new Promise((resolver) => setTimeout(resolver, 400));
  return [...AUDITORIA_MOCK];
}

// --- API real --------------------------------------------------------------

interface FilaAuditoria {
  id_log: number;
  fecha: string;
  nombre_usuario: string;
  nombre_autorizador: string | null;
  accion: AccionAuditoria;
  entidad: string;
  id_entidad: number;
  justificacion: string | null;
  datos_anteriores: Snapshot;
  datos_nuevos: Snapshot;
  direccion_ip: string | null;
}

function aEntrada(fila: FilaAuditoria): EntradaAuditoria {
  return {
    idLog: fila.id_log,
    fecha: new Date(fila.fecha),
    usuario: fila.nombre_usuario,
    autorizador: fila.nombre_autorizador,
    accion: fila.accion,
    entidad: fila.entidad,
    idEntidad: Number(fila.id_entidad),
    justificacion: fila.justificacion,
    datosAnteriores: fila.datos_anteriores ?? null,
    datosNuevos: fila.datos_nuevos ?? null,
    direccionIp: fila.direccion_ip,
  };
}

export async function listarAuditoria(): Promise<EntradaAuditoria[]> {
  if (USAR_MOCK) return listarAuditoriaMock();

  const { data } = await apiClient.get("/audit");
  return (data.data as FilaAuditoria[]).map(aEntrada);
}

/** Mensaje en español para el error de cargar el log de auditoría. */
export function mensajeErrorAuditoria(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.code === "ERR_NETWORK") return "No hay conexión con el servidor.";
    const estado = error.response?.status;
    if (estado === 401 || estado === 403) {
      return "Tu sesión no tiene permiso para consultar la auditoría.";
    }
    if (estado && estado >= 500) {
      return "El servidor no pudo traer el log de auditoría.";
    }
  }
  return "No se pudo cargar el log de auditoría.";
}
