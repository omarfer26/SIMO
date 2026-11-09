// Consola de descargas de reportes — Tipos y datos del dominio.
//
// Un "reporte" es un archivo ya generado (Excel, PDF o Word) que el usuario
// baja desde /reportes. Acá viven su forma, los catálogos de formatos y
// categorías, y las funciones puras que filtran la lista por formato,
// categoría y texto. Siguen la convención del resto del front: nombres en
// camelCase y lógica de negocio separada de la presentación (los colores y los
// íconos de cada formato viven en components/reportes/TarjetaReporte.tsx).
//
// El filtro por rango de fechas NO se aplica acá: lo hace quien llama con la
// utilidad compartida `fechaEnRango` de components/pedidos/FiltroFechasPedidos
// (la misma que reusa el Kardex), para no traer al `lib/` una dependencia en
// tiempo de ejecución de un componente. Solo se importa su TIPO (RangoFechas),
// que TypeScript borra al compilar.

import type { RangoFechas } from "@/components/pedidos/FiltroFechasPedidos";

/** Tipos de documento que se pueden descargar. */
export type FormatoReporte = "EXCEL" | "PDF" | "WORD";

/** Nombre legible de cada formato (etiquetas y opciones). */
export const NOMBRES_FORMATO: Record<FormatoReporte, string> = {
  EXCEL: "Excel",
  PDF: "PDF",
  WORD: "Word",
};

/** Extensión del archivo, sin punto ("xlsx"). La usa el servicio al descargar. */
export const EXTENSION_FORMATO: Record<FormatoReporte, string> = {
  EXCEL: "xlsx",
  PDF: "pdf",
  WORD: "docx",
};

/** Tipo MIME del archivo. La usa el servicio al bajar el blob real. */
export const MIME_FORMATO: Record<FormatoReporte, string> = {
  EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PDF: "application/pdf",
  WORD: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Áreas del sistema a las que pertenece un reporte. */
export type CategoriaReporte =
  | "VENTAS"
  | "INVENTARIO"
  | "PEDIDOS"
  | "CLIENTES"
  | "FINANZAS";

export const NOMBRES_CATEGORIA: Record<CategoriaReporte, string> = {
  VENTAS: "Ventas",
  INVENTARIO: "Inventario",
  PEDIDOS: "Pedidos",
  CLIENTES: "Clientes",
  FINANZAS: "Finanzas",
};

export interface Reporte {
  id: number;
  /** Título corto que se ve en la tarjeta ("Ventas por período"). */
  nombre: string;
  /** Qué contiene, en una línea. */
  descripcion: string;
  categoria: CategoriaReporte;
  formato: FormatoReporte;
  /** Período que cubre, en texto libre ("Últimos 30 días"). */
  periodo: string;
  /** Cuándo se generó el archivo: es la fecha que filtra el rango Desde/Hasta. */
  fechaGeneracion: Date;
  /** Tamaño en bytes, para mostrar "1,2 MB". */
  tamanoBytes: number;
  /** Nombre del archivo con su extensión ("ventas-por-periodo.xlsx"). */
  nombreArchivo: string;
}

// --- Filtros de la consola -------------------------------------------------

export type FiltroFormato = FormatoReporte | "todos";
export type FiltroCategoria = CategoriaReporte | "todos";

export interface FiltrosReportes {
  /** Rango de fechas de generación. { desde: "", hasta: "" } = sin filtrar. */
  rango: RangoFechas;
  formato: FiltroFormato;
  categoria: FiltroCategoria;
  /** Texto libre buscado en nombre, descripción y archivo. "" = sin buscar. */
  busqueda: string;
}

export const FILTROS_INICIALES: FiltrosReportes = {
  rango: { desde: "", hasta: "" },
  formato: "todos",
  categoria: "todos",
  busqueda: "",
};

/** Opciones del selector de tipo de documento (incluye "todos"). */
export const OPCIONES_FORMATO: { value: FiltroFormato; label: string }[] = [
  { value: "todos", label: "Todos los formatos" },
  { value: "EXCEL", label: "Excel (.xlsx)" },
  { value: "PDF", label: "PDF (.pdf)" },
  { value: "WORD", label: "Word (.docx)" },
];

/** Opciones del selector de categoría (incluye "todas"). */
export const OPCIONES_CATEGORIA: { value: FiltroCategoria; label: string }[] = [
  { value: "todos", label: "Todas las categorías" },
  ...(Object.keys(NOMBRES_CATEGORIA) as CategoriaReporte[]).map((codigo) => ({
    value: codigo as FiltroCategoria,
    label: NOMBRES_CATEGORIA[codigo],
  })),
];

/** true si algún filtro difiere del inicial (para mostrar "Limpiar filtros"). */
export function hayFiltrosActivos(filtros: FiltrosReportes): boolean {
  return (
    filtros.rango.desde !== "" ||
    filtros.rango.hasta !== "" ||
    filtros.formato !== "todos" ||
    filtros.categoria !== "todos" ||
    filtros.busqueda.trim() !== ""
  );
}

/**
 * Se queda con los reportes que cumplen los filtros de formato, categoría y
 * texto (se acumulan). El rango de fechas se aplica aparte, con `fechaEnRango`
 * (ver el comentario del archivo): esta función recibe la lista ya recortada
 * por fecha.
 */
export function filtrarReportes(
  reportes: Reporte[],
  filtros: FiltrosReportes,
): Reporte[] {
  const texto = filtros.busqueda.trim().toLowerCase();
  return reportes.filter((reporte) => {
    const coincideFormato =
      filtros.formato === "todos" || reporte.formato === filtros.formato;
    const coincideCategoria =
      filtros.categoria === "todos" || reporte.categoria === filtros.categoria;
    const coincideTexto =
      texto === "" ||
      reporte.nombre.toLowerCase().includes(texto) ||
      reporte.descripcion.toLowerCase().includes(texto) ||
      reporte.nombreArchivo.toLowerCase().includes(texto);
    return coincideFormato && coincideCategoria && coincideTexto;
  });
}
