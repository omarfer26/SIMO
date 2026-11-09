// Consola de descargas de reportes — Puerta única hacia los datos.
//
// La página /reportes llama a listarReportes() y descargarReporte() sin saber
// si detrás está la API real o el mock, igual que lib/pedidos/pedidosService.ts.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_REPORTES_MOCK=false
// y reiniciar `npm run dev`. Mientras no sea "false" se usa el mock, porque
// todavía no hay endpoints de reportes en el backend (solo la maqueta del front).
//
// CONTRATO QUE SE LE PROPONE AL BACKEND:
//   GET /api/reports?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&formato=EXCEL|PDF|WORD
//     - desde/hasta opcionales e inclusivos; filtran por el día de
//       fecha_generacion en hora local.
//     Responde 200: { data: [ { id_reporte, nombre, descripcion, categoria,
//       formato, periodo, fecha_generacion, tamano_bytes, nombre_archivo } ] }
//   GET /api/reports/:id/download
//     Responde 200 con el archivo (blob) y su Content-Type según el formato; el
//     front lo guarda con guardarArchivo(). Errores: 404 no existe · 410 el
//     archivo venció y hay que regenerarlo.
// Por ahora el front pide todo y filtra en el navegador (así los filtros son
// instantáneos). Cuando haya muchos reportes, se mandan desde/hasta/formato.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import {
  EXTENSION_FORMATO,
  MIME_FORMATO,
  type CategoriaReporte,
  type FormatoReporte,
  type Reporte,
} from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_REPORTES_MOCK !== "false";

// --- Mock: catálogo de reportes ya generados -------------------------------

// Días hacia atrás desde hoy (a una hora fija), para que los atajos del filtro
// de fechas ("Hoy", "Últimos 7 días", "Este mes") recorten la lista de verdad.
function haceDias(dias: number, hora = 9): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(hora, 0, 0, 0);
  return fecha;
}

const REPORTES_MOCK: Reporte[] = [
  {
    id: 1,
    nombre: "Ventas por período",
    descripcion:
      "Detalle de todas las ventas del rango, con cliente, productos y total.",
    categoria: "VENTAS",
    formato: "EXCEL",
    periodo: "Últimos 30 días",
    fechaGeneracion: haceDias(0, 8),
    tamanoBytes: 284_544,
    nombreArchivo: "ventas-por-periodo.xlsx",
  },
  {
    id: 2,
    nombre: "Ventas por método de pago",
    descripcion:
      "Totales agrupados por efectivo, Nequi, Daviplata y transferencia.",
    categoria: "FINANZAS",
    formato: "PDF",
    periodo: "Octubre de 2026",
    fechaGeneracion: haceDias(1, 17),
    tamanoBytes: 512_000,
    nombreArchivo: "ventas-metodo-pago-octubre.pdf",
  },
  {
    id: 3,
    nombre: "Inventario actual",
    descripcion:
      "Stock de Bodega y Almacén por producto, con su valor por costo promedio.",
    categoria: "INVENTARIO",
    formato: "EXCEL",
    periodo: "A la fecha",
    fechaGeneracion: haceDias(2, 7),
    tamanoBytes: 1_048_576,
    nombreArchivo: "inventario-actual.xlsx",
  },
  {
    id: 4,
    nombre: "Productos bajo stock mínimo",
    descripcion:
      "Productos por debajo de su mínimo, para armar el pedido de reposición.",
    categoria: "INVENTARIO",
    formato: "PDF",
    periodo: "A la fecha",
    fechaGeneracion: haceDias(3, 11),
    tamanoBytes: 320_000,
    nombreArchivo: "stock-minimo.pdf",
  },
  {
    id: 5,
    nombre: "Kardex de movimientos",
    descripcion:
      "Entradas, salidas y saldos de cada producto en orden cronológico.",
    categoria: "INVENTARIO",
    formato: "EXCEL",
    periodo: "Últimos 90 días",
    fechaGeneracion: haceDias(5, 15),
    tamanoBytes: 2_411_724,
    nombreArchivo: "kardex-movimientos.xlsx",
  },
  {
    id: 6,
    nombre: "Pedidos y su estado",
    descripcion:
      "Pedidos del período con cliente, estado actual y fecha de entrega.",
    categoria: "PEDIDOS",
    formato: "WORD",
    periodo: "Últimos 30 días",
    fechaGeneracion: haceDias(6, 10),
    tamanoBytes: 198_656,
    nombreArchivo: "pedidos-estado.docx",
  },
  {
    id: 7,
    nombre: "Listado de clientes",
    descripcion:
      "Clientes activos e inactivos, con contacto y dirección de entrega.",
    categoria: "CLIENTES",
    formato: "EXCEL",
    periodo: "A la fecha",
    fechaGeneracion: haceDias(9, 9),
    tamanoBytes: 156_672,
    nombreArchivo: "clientes.xlsx",
  },
  {
    id: 8,
    nombre: "Compras a proveedores",
    descripcion:
      "Órdenes de compra del período, con proveedor, cantidades y total.",
    categoria: "FINANZAS",
    formato: "PDF",
    periodo: "Septiembre de 2026",
    fechaGeneracion: haceDias(20, 14),
    tamanoBytes: 742_400,
    nombreArchivo: "compras-proveedores-septiembre.pdf",
  },
  {
    id: 9,
    nombre: "Historial de ventas por cliente",
    descripcion:
      "Compras de cada cliente en el período, para fidelización y cartera.",
    categoria: "CLIENTES",
    formato: "WORD",
    periodo: "Últimos 60 días",
    fechaGeneracion: haceDias(35, 16),
    tamanoBytes: 245_760,
    nombreArchivo: "historial-clientes.docx",
  },
];

async function listarReportesMock(): Promise<Reporte[]> {
  // Pequeña demora para que se vea el estado de carga (Skeleton), como el mock
  // de pedidos. Se devuelve una copia para que nadie muté el catálogo.
  await new Promise((resolver) => setTimeout(resolver, 400));
  return [...REPORTES_MOCK];
}

// --- API real --------------------------------------------------------------

interface FilaReporte {
  id_reporte: number;
  nombre: string;
  descripcion: string;
  categoria: CategoriaReporte;
  formato: FormatoReporte;
  periodo: string;
  fecha_generacion: string;
  tamano_bytes: number | string;
  nombre_archivo: string;
}

function aReporte(fila: FilaReporte): Reporte {
  return {
    id: fila.id_reporte,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    categoria: fila.categoria,
    formato: fila.formato,
    periodo: fila.periodo,
    fechaGeneracion: new Date(fila.fecha_generacion),
    tamanoBytes: Number(fila.tamano_bytes),
    nombreArchivo: fila.nombre_archivo,
  };
}

export async function listarReportes(): Promise<Reporte[]> {
  if (USAR_MOCK) return listarReportesMock();

  const { data } = await apiClient.get("/reports");
  return (data.data as FilaReporte[]).map(aReporte);
}

// Guarda un blob en el disco con un <a download> temporal. Solo se llama en el
// navegador (al hacer clic en "Descargar"), nunca en el render del servidor.
function guardarArchivo(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

/**
 * Baja el archivo de un reporte. En el mock no hay backend del que traer bytes,
 * así que se simula la generación con una demora y NO se guarda un archivo (un
 * .xlsx/.pdf/.docx de mentira no abriría); la consola avisa con un Toast. Al
 * poner NEXT_PUBLIC_REPORTES_MOCK=false se pide el blob real y se guarda.
 */
export async function descargarReporte(reporte: Reporte): Promise<void> {
  if (USAR_MOCK) {
    await new Promise((resolver) => setTimeout(resolver, 700));
    return;
  }

  const respuesta = await apiClient.get(`/reports/${reporte.id}/download`, {
    responseType: "blob",
  });
  const blob =
    respuesta.data instanceof Blob
      ? respuesta.data
      : new Blob([respuesta.data as BlobPart], {
          type: MIME_FORMATO[reporte.formato],
        });
  const nombre =
    reporte.nombreArchivo ||
    `reporte-${reporte.id}.${EXTENSION_FORMATO[reporte.formato]}`;
  guardarArchivo(blob, nombre);
}

/** Mensaje en español para el error de cargar o descargar reportes. */
export function mensajeErrorReportes(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.code === "ERR_NETWORK") {
      return "No hay conexión con el servidor.";
    }
    const estado = error.response?.status;
    if (estado === 404) return "El reporte ya no existe en el servidor.";
    if (estado === 410) return "El archivo venció; hay que generarlo de nuevo.";
    if (estado && estado >= 500) {
      return "El servidor no pudo preparar los reportes.";
    }
  }
  return "No se pudo completar la operación con los reportes.";
}
