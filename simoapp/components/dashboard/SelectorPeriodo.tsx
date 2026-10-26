"use client";

// Dashboard Operacional — Selector del período que alimenta todo el tablero
// (tarjetas, serie de ventas, rotación y medios de pago). Es un grupo de
// botones en vez de un <select> porque solo hay cuatro opciones y así el
// cambio se ve de inmediato, igual que las pestañas de /ventas.

import { PERIODOS_DASHBOARD } from "@/lib/dashboard/metricas";
import type { PeriodoDashboard } from "@/lib/dashboard/tipos";

interface SelectorPeriodoProps {
  periodo: PeriodoDashboard;
  onCambiar: (periodo: PeriodoDashboard) => void;
}

export default function SelectorPeriodo({ periodo, onCambiar }: SelectorPeriodoProps) {
  return (
    <div
      role="group"
      aria-label="Período del tablero"
      className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800"
    >
      {PERIODOS_DASHBOARD.map((opcion) => {
        const activo = opcion.id === periodo;
        return (
          <button
            key={opcion.id}
            type="button"
            onClick={() => onCambiar(opcion.id)}
            aria-pressed={activo}
            title={opcion.descripcion}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              activo
                ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-700 dark:text-emerald-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
