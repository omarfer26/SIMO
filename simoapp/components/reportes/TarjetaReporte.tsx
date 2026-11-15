"use client";

// Consola de descargas de reportes — Tarjeta de un reporte (solo presentación).
//
// Muestra el ícono y el color según el tipo de documento, el nombre, la
// descripción, las etiquetas de formato y categoría, los datos del archivo
// (período, tamaño, fecha de generación, nombre) y el botón "Descargar". Qué
// hace el clic lo decide la consola (onDescargar); esta tarjeta no sabe del
// backend ni de los filtros.

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatoFechaReporte, formatoTamanoArchivo } from "@/lib/reportes/formato";
import {
  FORMATOS_EXPORTACION,
  NOMBRES_CATEGORIA,
  NOMBRES_FORMATO,
  type FormatoReporte,
  type Reporte,
} from "@/lib/reportes/tipos";

interface TarjetaReporteProps {
  reporte: Reporte;
  /** true mientras se baja este reporte: el botón muestra el Spinner. */
  descargando: boolean;
  onDescargar: (reporte: Reporte, formato: FormatoReporte) => void;
}

export default function TarjetaReporte({
  reporte,
  descargando,
  onDescargar,
}: TarjetaReporteProps) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú desplegable al hacer clic fuera
  useEffect(() => {
    if (!menuAbierto) return;

    function handleClickFuera(evento: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(evento.target as Node)) {
        setMenuAbierto(false);
      }
    }

    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, [menuAbierto]);

  function elegirFormato(formato: FormatoReporte) {
    setMenuAbierto(false);
    onDescargar(reporte, formato);
  }

  return (
    <article className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-xs transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      {/* Ícono de reporte */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          aria-hidden="true"
        >
          <IconoDocumento />
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
        <div className="relative shrink-0" ref={menuRef}>
          <Button
            onClick={() => setMenuAbierto((prev) => !prev)}
            disabled={descargando}
            aria-expanded={menuAbierto}
            aria-haspopup="true"
            aria-label={`Elegir formato para descargar ${reporte.nombre}`}
          >
            {descargando ? (
              <>
                <Spinner size="sm" color="white" />
                Descargando…
              </>
            ) : (
              <>
                <IconoDescarga />
                <span>Descargar</span>
                <IconoChevronAbajo />
              </>
            )}
          </Button>

          {/* Mini menú desplegable para elegir formato (PDF o Excel) */}
          {menuAbierto && (
            <div
              role="menu"
              aria-label="Formatos de descarga"
              className="absolute right-0 bottom-full mb-1.5 z-20 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Exportar como:
              </div>
              {FORMATOS_EXPORTACION.map((formato) => {
                const esExcel = formato === "EXCEL";
                return (
                  <button
                    key={formato}
                    type="button"
                    role="menuitem"
                    onClick={() => elegirFormato(formato)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${esExcel ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      aria-hidden="true"
                    />
                    <span>{NOMBRES_FORMATO[formato]}</span>
                    <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">
                      .{esExcel ? "xlsx" : "pdf"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function IconoDocumento() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconoChevronAbajo() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-400"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
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
