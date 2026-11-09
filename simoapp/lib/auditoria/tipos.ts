// HU-15 — Log de Auditoría Inalterable. Tipos y datos del dominio.
//
// Cada entrada sigue la tabla `log_auditoria`
// (backend/db/migrations/007_auditoria.sql): la operación crítica, quién la
// hizo, quién la autorizó (obligatorio en anulaciones), la justificación y una
// foto de los datos antes y después. Es una bitácora de SOLO LECTURA: el front
// no ofrece editar ni borrar (la base ya lo bloquea con triggers, RF-24).
//
// Como en lib/reportes, los nombres y catálogos viven acá (datos), mientras que
// los colores/etiquetas de cada acción van en el componente (presentación). El
// filtro por rango de fechas se aplica aparte con la utilidad compartida
// `fechaEnRango`; solo se importa su TIPO (RangoFechas), que TS borra al compilar.

import type { RangoFechas } from "@/components/pedidos/FiltroFechasPedidos";

// Mismos códigos que acepta el backend (CHECK de la columna `accion`).
export type AccionAuditoria =
  | "AJUSTE_INVENTARIO"
  | "ANULACION_VENTA"
  | "CANCELACION_PEDIDO"
  | "CAMBIO_PRECIO"
  | "CAMBIO_ROL_USUARIO"
  | "CAMBIO_ESTADO_USUARIO"
  | "ACTUALIZACION_EMPRESA";

export const NOMBRES_ACCION: Record<AccionAuditoria, string> = {
  AJUSTE_INVENTARIO: "Ajuste de inventario",
  ANULACION_VENTA: "Anulación de venta",
  CANCELACION_PEDIDO: "Cancelación de pedido",
  CAMBIO_PRECIO: "Cambio de precio",
  CAMBIO_ROL_USUARIO: "Cambio de rol de usuario",
  CAMBIO_ESTADO_USUARIO: "Cambio de estado de usuario",
  ACTUALIZACION_EMPRESA: "Actualización de empresa",
};

/**
 * Acciones que HU-15 quiere supervisar de un vistazo (cancelaciones y ajustes
 * manuales de existencias). Llevan justificación obligatoria en la base.
 */
export const ACCIONES_CRITICAS: AccionAuditoria[] = [
  "AJUSTE_INVENTARIO",
  "ANULACION_VENTA",
  "CANCELACION_PEDIDO",
];

/** Foto de los datos en un momento (JSONB en la base). */
export type Snapshot = Record<string, unknown> | null;

export interface EntradaAuditoria {
  idLog: number;
  fecha: Date;
  /** Nombre del usuario que ejecutó la operación. */
  usuario: string;
  /** Nombre de quien autorizó (solo anulaciones); null si no aplica. */
  autorizador: string | null;
  accion: AccionAuditoria;
  /** Tabla afectada: productos, ventas, pedidos, usuarios, empresa. */
  entidad: string;
  idEntidad: number;
  /** Causa escrita; obligatoria en ajustes, anulaciones y cancelaciones. */
  justificacion: string | null;
  datosAnteriores: Snapshot;
  datosNuevos: Snapshot;
  direccionIp: string | null;
}

// --- Filtros del panel -----------------------------------------------------

export type FiltroAccion = AccionAuditoria | "todos";

export interface FiltrosAuditoria {
  /** Rango de fechas del registro. { desde: "", hasta: "" } = sin filtrar. */
  rango: RangoFechas;
  accion: FiltroAccion;
  /** Solo las cancelaciones y ajustes manuales de existencias (HU-15). */
  soloCriticas: boolean;
  /** Texto libre buscado en usuario, justificación y entidad. "" = sin buscar. */
  busqueda: string;
}

export const FILTROS_INICIALES: FiltrosAuditoria = {
  rango: { desde: "", hasta: "" },
  accion: "todos",
  soloCriticas: false,
  busqueda: "",
};

/** Opciones del selector de acción (incluye "todas"). */
export const OPCIONES_ACCION: { value: FiltroAccion; label: string }[] = [
  { value: "todos", label: "Todas las acciones" },
  ...(Object.keys(NOMBRES_ACCION) as AccionAuditoria[]).map((codigo) => ({
    value: codigo as FiltroAccion,
    label: NOMBRES_ACCION[codigo],
  })),
];

/** true si algún filtro difiere del inicial (para mostrar "Limpiar filtros"). */
export function hayFiltrosActivos(filtros: FiltrosAuditoria): boolean {
  return (
    filtros.rango.desde !== "" ||
    filtros.rango.hasta !== "" ||
    filtros.accion !== "todos" ||
    filtros.soloCriticas ||
    filtros.busqueda.trim() !== ""
  );
}

/**
 * Filtra por acción, "solo críticas" y texto (se acumulan). El rango de fechas
 * se aplica aparte con `fechaEnRango` (ver comentario del archivo): esta
 * función recibe la lista ya recortada por fecha.
 */
export function filtrarAuditoria(
  entradas: EntradaAuditoria[],
  filtros: FiltrosAuditoria,
): EntradaAuditoria[] {
  const texto = filtros.busqueda.trim().toLowerCase();
  return entradas.filter((entrada) => {
    const coincideAccion =
      filtros.accion === "todos" || entrada.accion === filtros.accion;
    const coincideCritica =
      !filtros.soloCriticas || ACCIONES_CRITICAS.includes(entrada.accion);
    const coincideTexto =
      texto === "" ||
      entrada.usuario.toLowerCase().includes(texto) ||
      entrada.entidad.toLowerCase().includes(texto) ||
      (entrada.justificacion ?? "").toLowerCase().includes(texto);
    return coincideAccion && coincideCritica && coincideTexto;
  });
}
