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

//
// SCRUM-57 (Camilo) — Se agregó registrarPedido() para el formulario "Nuevo
// pedido". Usa el MISMO interruptor NEXT_PUBLIC_PEDIDOS_MOCK que la lista,
// para que un pedido creado en el mock aparezca en la lista del mock (y uno
// creado en la API, en la lista de la API).
// CONTRATO (el que ya implementó Ramón en la rama back-end, SCRUM-81):
//   POST /api/orders   (roles VENDEDOR, GERENTE y ADMIN)
//   Recibe: { id_cliente, fecha_entrega_pactada: "AAAA-MM-DD",
//             direccion_entrega?, observaciones?,
//             lineas: [{ id_producto, cantidad }] }
//     - quien registra sale del token; el precio de cada línea es el precio
//       de venta vigente del producto (lo pone la base, no el front).
//   Responde 201: { message, pedido, advertencia? }
//     - pedido trae los mismos campos que una fila de GET /api/orders.
//     - advertencia: si hoy no alcanza el stock de algún producto. No
//       impide registrar (el stock se descuenta en EN_PREPARACION).
//   Errores: 400 dato inválido · 404 cliente o producto no existe ·
//            409 el cliente está inactivo.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { DatosPedidoNuevo, EstadoPedido, Pedido, PedidoRegistrado } from "./tipos";

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

export async function actualizarEstadoPedido(
  idPedido: number,
  nuevoEstado: EstadoPedido,
): Promise<{ id: number; estado: EstadoPedido }> {
  if (USAR_MOCK) return actualizarEstadoPedidoMock(idPedido, nuevoEstado);

  const { data } = await apiClient.patch(`/orders/${idPedido}/status`, {
    estado: nuevoEstado,
  });

  return {
    id: idPedido,
    estado: data.estado || nuevoEstado,
  };
}

type TipoErrorRegistro = "datos_invalidos" | "no_existe" | "conflicto" | "sin_conexion" | "servidor";

export class ErrorRegistroPedido extends Error {
  tipo: TipoErrorRegistro;

  constructor(tipo: TipoErrorRegistro, mensaje: string) {
    super(mensaje);
    this.name = "ErrorRegistroPedido";
    this.tipo = tipo;
  }
}

// SCRUM-57 (Camilo) — Registra un pedido nuevo (nace REGISTRADO).
export async function registrarPedido(datos: DatosPedidoNuevo): Promise<PedidoRegistrado> {
  if (USAR_MOCK) return registrarPedidoMock(datos);

  try {
    const { data } = await apiClient.post("/orders", {
      id_cliente: datos.idCliente,
      fecha_entrega_pactada: datos.fechaEntregaPactada,
      direccion_entrega: datos.direccionEntrega.trim() || undefined,
      observaciones: datos.observaciones.trim() || undefined,
      lineas: datos.lineas.map((l) => ({ id_producto: l.idProducto, cantidad: l.cantidad })),
    });
    return {
      pedido: aPedido(data.pedido as FilaPedido),
      advertencia: typeof data.advertencia === "string" ? data.advertencia : null,
    };
  } catch (error) {
    if (!isAxiosError(error)) throw new ErrorRegistroPedido("servidor", "Error inesperado.");
    if (!error.response) throw new ErrorRegistroPedido("sin_conexion", error.message);
    const mensaje: unknown = error.response.data?.message;
    const texto = typeof mensaje === "string" ? mensaje : error.message;
    if (error.response.status === 400) throw new ErrorRegistroPedido("datos_invalidos", texto);
    if (error.response.status === 404) throw new ErrorRegistroPedido("no_existe", texto);
    if (error.response.status === 409) throw new ErrorRegistroPedido("conflicto", texto);
    throw new ErrorRegistroPedido("servidor", texto);
  }
}

export function mensajeErrorRegistro(error: unknown): string {
  if (!(error instanceof ErrorRegistroPedido)) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  switch (error.tipo) {
    case "datos_invalidos":
      return error.message || "Hay datos inválidos en el pedido. Revísalos.";
    case "no_existe":
      return `${error.message || "El cliente o un producto ya no existe."} Recarga la página y revisa.`;
    case "conflicto":
      return error.message || "El cliente está inactivo: no se le pueden registrar pedidos.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. El pedido NO se registró; inténtalo de nuevo.";
    case "servidor":
      return "El servidor tuvo un problema. El pedido NO se registró; inténtalo de nuevo.";
  }
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

const CLAVE_STORAGE_PEDIDOS = "simo.pedidos.mock";

function obtenerPedidosMemoria(): Pedido[] {
  if (typeof window !== "undefined") {
    try {
      const guardado = localStorage.getItem(CLAVE_STORAGE_PEDIDOS);
      if (guardado) {
        const parsed = JSON.parse(guardado) as Array<Omit<Pedido, "fechaSolicitud" | "fechaEntregaPactada"> & { fechaSolicitud: string; fechaEntregaPactada: string }>;
        return parsed.map((p) => ({
          ...p,
          fechaSolicitud: new Date(p.fechaSolicitud),
          fechaEntregaPactada: new Date(p.fechaEntregaPactada),
        }));
      }
    } catch {
      // Si falla localStorage, usa semilla
    }
  }

  // Generar desde datosMock iniciales
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

function guardarPedidosMemoria(pedidos: Pedido[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLAVE_STORAGE_PEDIDOS, JSON.stringify(pedidos));
  } catch (err) {
    console.error("Error guardando pedidos en storage:", err);
  }
}

async function listarPedidosMock(): Promise<Pedido[]> {
  await esperar(400);
  const pedidos = obtenerPedidosMemoria();
  // Asegurar que quede guardado en storage para cambios futuros
  guardarPedidosMemoria(pedidos);
  return pedidos;
}

async function actualizarEstadoPedidoMock(
  idPedido: number,
  nuevoEstado: EstadoPedido,
): Promise<{ id: number; estado: EstadoPedido }> {
  await esperar(300);
  const pedidos = obtenerPedidosMemoria();
  const indice = pedidos.findIndex((p) => p.id === idPedido);
  if (indice === -1) {
    throw new Error(`Pedido #${idPedido} no encontrado.`);
  }

  pedidos[indice].estado = nuevoEstado;
  guardarPedidosMemoria(pedidos);
  return { id: idPedido, estado: nuevoEstado };
}

// SCRUM-57 (Camilo) — Mock del registro: lo agrega a los pedidos guardados en
// este navegador, con el número siguiente, y avisa si no alcanza el stock
// (el formulario ya lo sabe, así que el mock no repite esa cuenta).
async function registrarPedidoMock(datos: DatosPedidoNuevo): Promise<PedidoRegistrado> {
  await esperar(700);
  const pedidos = obtenerPedidosMemoria();
  const total = datos.lineas.reduce(
    (suma, l) => suma + Math.round(l.cantidad * l.precioUnitario * 100) / 100,
    0,
  );
  // Igual que el backend: se pacta para el final del día elegido.
  const [anio, mes, dia] = datos.fechaEntregaPactada.split("-").map(Number);
  const pedido: Pedido = {
    id: pedidos.reduce((mayor, p) => Math.max(mayor, p.id), 1000) + 1,
    cliente: datos.nombreCliente,
    registradoPor: "Tú (sesión actual)",
    estado: "REGISTRADO",
    fechaSolicitud: new Date(),
    fechaEntregaPactada: new Date(anio, mes - 1, dia, 23, 59, 59),
    total,
  };
  guardarPedidosMemoria([...pedidos, pedido]);
  return { pedido, advertencia: null };
}
