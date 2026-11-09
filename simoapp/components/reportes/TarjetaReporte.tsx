"use client";

// Consola de descargas de reportes — Tarjeta de un reporte (solo presentación).
//
// Muestra el ícono y el color según el tipo de documento, el nombre, la
// descripción, las etiquetas de formato y categoría, los datos del archivo
// (período, tamaño, fecha de generación, nombre) y el botón "Descargar". Qué
// hace el clic lo decide la consola (onDescargar); esta tarjeta no sabe del
// backend ni de los filtros.

import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatoFechaReporte, formatoTamanoArchivo } from "@/lib/reportes/formato";
import {
  NOMBRES_CATEGORIA,
  NOMBRES_FORMATO,
  type FormatoReporte,
  type Reporte,
} from "@/lib/reportes/tipos";

// Color e ícono por tipo de documento. Es presentación, por eso vive acá y no
// en lib/reportes/tipos.ts. Verde para Excel, rojo para PDF, azul para Word
// (las variantes que ya tiene Badge).
const ESTILO_FORMATO: Record<
  FormatoReporte,
  { variante: BadgeVariant; tile: string; rotulo: string }
> = {
  EXCEL: {
    variante: "success",
    tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    rotulo: "XLS",
  },
  PDF: {
    variante: "danger",
    tile: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    rotulo: "PDF",
  },
  WORD: {
    variante: "primary",
    tile: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    rotulo: "DOC",
  },
};

interface TarjetaReporteProps {
  reporte: Reporte;
  /** true mientras se baja este reporte: el botón muestra el Spinner. */
  descargando: boolean;
  onDescargar: (reporte: Reporte) => void;
}

export default function TarjetaReporte({
  reporte,
  descargando,
  onDescargar,
}: TarjetaReporteProps) {
  const estilo = ESTILO_FORMATO[reporte.formato];

  return (
    <article className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-xs transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start gap-3">
        {/* Ícono del formato (rótulo tipo ficha, no una imagen). */}
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xs font-bold ${estilo.tile}`}
          aria-hidden="true"
        >
          {estilo.rotulo}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            title={reporte.nombre}
          >
            {reporte.nombre}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
            {reporte.descripcion}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={estilo.variante} size="sm" pill>
          {NOMBRES_FORMATO[reporte.formato]}
        </Badge>
        <Badge variant="default" size="sm" pill>
          {NOMBRES_CATEGORIA[reporte.categoria]}
        </Badge>
      </div>

      <dl className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <div className="flex justify-between gap-2">
          <dt>Período</dt>
          <dd className="truncate font-medium text-zinc-700 dark:text-zinc-300">
            {reporte.periodo}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Generado</dt>
          <dd className="font-medium text-zinc-700 dark:text-zinc-300">
            {formatoFechaReporte(reporte.fechaGeneracion)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Tamaño</dt>
          <dd className="font-medium text-zinc-700 dark:text-zinc-300">
            {formatoTamanoArchivo(reporte.tamanoBytes)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span
          className="truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500"
          title={reporte.nombreArchivo}
        >
          {reporte.nombreArchivo}
        </span>
        <Button
          className="shrink-0"
          onClick={() => onDescargar(reporte)}
          disabled={descargando}
          aria-label={`Descargar ${reporte.nombre} en ${NOMBRES_FORMATO[reporte.formato]}`}
        >
          {descargando ? (
            <>
              <Spinner size="sm" color="white" />
              Descargando…
            </>
          ) : (
            <>
              <IconoDescarga />
              Descargar
            </>
          )}
        </Button>
      </div>
    </article>
  );
}

function IconoDescarga() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
    </svg>
  );
}
