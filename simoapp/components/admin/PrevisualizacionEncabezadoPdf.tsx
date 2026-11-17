"use client";

// Previsualización responsive de parámetros de empresa, logo y NIT
// Diseñada para mostrar fielmente cómo se estampará el encabezado institucional
// en los reportes generados en PDF (A4).

import { useState } from "react";
import type { Empresa } from "@/components/shell/tipos";

interface PrevisualizacionEncabezadoPdfProps {
  empresa: Empresa;
  compacto?: boolean;
}

export default function PrevisualizacionEncabezadoPdf({
  empresa,
  compacto = false,
}: PrevisualizacionEncabezadoPdfProps) {
  const [zoom, setZoom] = useState<"compacto" | "real">("compacto");

  const fechaMuestra = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <div className={`${compacto ? "mt-0" : "mt-8"} rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-red-100 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
              PDF
            </span>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Previsualización de Encabezado
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Estampado en reportes PDF (Razón Social, NIT y Logo).
          </p>
        </div>

        {/* Selector de escala/zoom */}
        {!compacto && (
          <div className="flex items-center gap-1.5 rounded-lg bg-zinc-100 p-1 text-xs dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setZoom("compacto")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                zoom === "compacto"
                  ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Responsiva
            </button>
            <button
              type="button"
              onClick={() => setZoom("real")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                zoom === "real"
                  ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Escala A4
            </button>
          </div>
        )}
      </div>

      {/* Contenedor del simulador de hoja A4 */}
      <div className="mt-4 overflow-x-auto rounded-lg bg-zinc-100/70 p-3 dark:bg-zinc-950/50 sm:p-4">
        <div
          className={`mx-auto rounded-md bg-white shadow-md ring-1 ring-zinc-300/60 dark:bg-zinc-900 dark:ring-zinc-700 transition-all ${
            !compacto && zoom === "real" ? "w-[760px] min-w-[760px]" : "w-full max-w-2xl"
          }`}
        >
          {/* Banda corporativa superior (idéntica a jsPDF) */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-5 py-3 text-white">
            <span className="text-xs font-bold tracking-wider uppercase">
              SISTEMA SIMO — GESTIÓN EMPRESARIAL
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
              DOCUMENTO OFICIAL
            </span>
          </div>

          {/* Encabezado estampado del PDF con datos de la Empresa */}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
              {/* Bloque izquierdo: Razón Social y NIT */}
              <div className="min-w-0 flex-1 space-y-1">
                <span className="inline-block rounded-sm bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  EMISOR AUTORIZADO
                </span>
                <h3 className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {empresa.razonSocial || "Nombre de la Empresa"}
                </h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <p>
                    <strong className="text-zinc-700 dark:text-zinc-300">NIT:</strong>{" "}
                    <span className="font-mono font-medium">{empresa.nit || "---"}</span>
                  </p>
                  {empresa.telefono && (
                    <p>
                      <strong className="text-zinc-700 dark:text-zinc-300">Tel:</strong> {empresa.telefono}
                    </p>
                  )}
                </div>
                {empresa.direccion && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    <strong>Dir:</strong> {empresa.direccion}
                  </p>
                )}
              </div>

              {/* Bloque derecho: Estampado del Logo Corporativo */}
              <div className="flex flex-col items-center shrink-0">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white p-1 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800">
                  {empresa.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={empresa.logoUrl}
                      alt={`Logo de ${empresa.razonSocial}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                      <span className="mt-0.5 text-[9px] font-medium">Sin logo</span>
                    </div>
                  )}
                </div>
                <span className="mt-1 font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
                  Estampa PDF (16×16 mm)
                </span>
              </div>
            </div>

            {/* Muestra representativa del cuerpo del reporte */}
            <div className="mt-4 space-y-3 opacity-70">
              <div className="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  REPORTE DE PRUEBA: Estado de Inventario y Ventas
                </span>
                <span className="text-[11px] font-mono">Emisión: {fechaMuestra}</span>
              </div>
              <div className="h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-2 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="grid grid-cols-4 gap-2 pt-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                <div className="h-4 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-4 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-4 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-4 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
          </div>

          {/* Pie de página simulado */}
          <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-2.5 text-right font-mono text-[10px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
            Página 1 de 1 · Generado por SIMO
          </div>
        </div>
      </div>
    </div>
  );
}
