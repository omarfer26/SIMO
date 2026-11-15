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
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
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

// Genera un archivo real y limpio descargable (.xlsx o .pdf) en modo cliente/mock
function descargarArchivoMock(reporte: Reporte, formato: FormatoReporte) {
  const nombreBase = reporte.nombreArchivo.replace(/\.[^/.]+$/, "");

  if (formato === "EXCEL") {
    // Generar libro de trabajo real en Excel (.xlsx) con autoajuste de celdas
    const datosExcel = [
      ["SISTEMA SIMO — REPORTE EMPRESARIAL"],
      ["Reporte:", reporte.nombre],
      ["Categoría:", reporte.categoria],
      ["Período:", reporte.periodo],
      ["Fecha de emisión:", reporte.fechaGeneracion.toLocaleString("es-CO")],
      ["Descripción:", reporte.descripcion],
      [], // fila en blanco separadora
      ["CÓDIGO", "CONCEPTO / INDICADOR", "PARÁMETRO", "VALOR REGISTRADO", "ESTADO OPERACIONAL"],
      ["SIMO-001", "Totalizado de Operaciones Consolidadas", "Corte del período", "$ 12.850.000", "CONFORME"],
      ["SIMO-002", "Movimientos de Existencias y Kardex", "Auditoría interna", "148 registros", "VERIFICADO"],
      ["SIMO-003", "Nivel de Disponibilidad de Mercancía", "Bodega / Almacén", "98.5%", "ÓPTIMO"],
      ["SIMO-004", "Cumplimiento de Entregas y Pedidos", "Despachos clientes", "94.2%", "EN META"],
    ];

    const hoja = XLSX.utils.aoa_to_sheet(datosExcel);

    // Auto-ajustar ancho de columnas para que cuadren perfectamente con el contenido
    const anchos = datosExcel.reduce<number[]>((acc, fila) => {
      fila.forEach((celda, i) => {
        const longitud = String(celda ?? "").length;
        acc[i] = Math.max(acc[i] || 10, longitud + 3);
      });
      return acc;
    }, []);

    hoja["!cols"] = anchos.map((ancho) => ({ wch: ancho }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte");

    const buffer = XLSX.write(libro, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    guardarArchivo(blob, `${nombreBase}.xlsx`);
  } else if (formato === "PDF") {
    // Generar y descargar documento PDF real limpio usando jsPDF
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Encabezado corporativo
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 24, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("SISTEMA SIMO — GESTIÓN EMPRESARIAL", 14, 15);

    // Título y metadatos
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text(reporte.nombre, 14, 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Categoría: ${reporte.categoria}`, 14, 44);
    doc.text(`Período cubierto: ${reporte.periodo}`, 14, 50);
    doc.text(`Fecha de emisión: ${reporte.fechaGeneracion.toLocaleString("es-CO")}`, 14, 56);
    doc.text(`Descripción: ${reporte.descripcion}`, 14, 62);

    // Línea divisoria
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(14, 68, 196, 68);

    // Cabecera de la tabla
    doc.setFillColor(241, 245, 249);
    doc.rect(14, 73, 182, 9, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text("CÓDIGO", 18, 79);
    doc.text("CONCEPTO / INDICADOR", 50, 79);
    doc.text("VALOR", 130, 79);
    doc.text("ESTADO", 165, 79);

    // Filas de datos
    const filas = [
      ["SIMO-001", "Totalizado de Operaciones Consolidadas", "$ 12.850.000", "Conforme"],
      ["SIMO-002", "Movimientos de Existencias y Kardex", "148 registros", "Verificado"],
      ["SIMO-003", "Nivel de Disponibilidad de Mercancía", "98.5%", "Óptimo"],
      ["SIMO-004", "Cumplimiento de Entregas y Pedidos", "94.2%", "En meta"],
    ];

    doc.setFont("helvetica", "normal");
    let y = 89;
    filas.forEach(([cod, concepto, val, estado]) => {
      doc.text(cod, 18, y);
      doc.text(concepto, 50, y);
      doc.text(val, 130, y);
      doc.text(estado, 165, y);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y + 3, 196, y + 3);
      y += 9;
    });

    // Pie de página
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Reporte emitido automáticamente por el Sistema Integrado de Manejo de Operaciones (SIMO).", 14, 285);

    // Descarga limpia y directa del PDF
    doc.save(`${nombreBase}.pdf`);
  } else {
    // Formato genérico
    const blob = new Blob([`Reporte: ${reporte.nombre}\nGenerado: ${new Date().toISOString()}`], {
      type: "text/plain;charset=utf-8",
    });
    guardarArchivo(blob, `${nombreBase}.${EXTENSION_FORMATO[formato]}`);
  }
}

/**
 * Baja el archivo de un reporte en el formato indicado (PDF o EXCEL). En el mock
 * genera un archivo real en el navegador (CSV para Excel o ventana imprimible limpia para PDF)
 * para que el usuario pueda visualizar y guardar su reporte.
 * Al poner NEXT_PUBLIC_REPORTES_MOCK=false se pide el blob real al backend y se guarda.
 */
export async function descargarReporte(
  reporte: Reporte,
  formatoDestino: FormatoReporte = reporte.formato,
): Promise<void> {
  if (USAR_MOCK) {
    await new Promise((resolver) => setTimeout(resolver, 500));
    descargarArchivoMock(reporte, formatoDestino);
    return;
  }

  const respuesta = await apiClient.get(`/reports/${reporte.id}/download`, {
    params: { formato: formatoDestino },
    responseType: "blob",
  });
  const blob =
    respuesta.data instanceof Blob
      ? respuesta.data
      : new Blob([respuesta.data as BlobPart], {
          type: MIME_FORMATO[formatoDestino],
        });

  // Reemplazar la extensión por el formato elegido si difiere del original
  const extensionActual = EXTENSION_FORMATO[reporte.formato];
  const extensionNueva = EXTENSION_FORMATO[formatoDestino];
  const nombreBase = reporte.nombreArchivo.endsWith(`.${extensionActual}`)
    ? reporte.nombreArchivo.slice(0, -(extensionActual.length + 1))
    : reporte.nombreArchivo.replace(/\.[^/.]+$/, "");

  const nombre = `${nombreBase || `reporte-${reporte.id}`}.${extensionNueva}`;
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
