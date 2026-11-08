"use client";

// HU-15 — Filtros del log de auditoría (presentación): rango de fechas, tipo de
// acción, un interruptor para ver solo cancelaciones y ajustes de existencias,
// y búsqueda libre. Recibe el estado y un callback; no decide nada (molde de
// lib/reportes/FiltrosReportes.tsx).

import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import Select from "@/components/ui/Select";
import FiltroFechasPedidos from "@/components/pedidos/FiltroFechasPedidos";
import {
  FILTROS_INICIALES,
  OPCIONES_ACCION,
  hayFiltrosActivos,
  type FiltroAccion,
  type FiltrosAuditoria,
} from "@/lib/auditoria/tipos";

interface Props {
  filtros: FiltrosAuditoria;
  onCambiar: (nuevos: FiltrosAuditoria) => void;
  /** Entradas en el log sin filtrar. */
  total: number;
  /** Entradas que pasan el filtro de fechas (para el mensaje del rango). */
  mostradosPorFecha: number;
}

export default function FiltrosAuditoria({
  filtros,
  onCambiar,
  total,
  mostradosPorFecha,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Rango de fechas: se reutiliza tal cual el componente de Pedidos. */}
      <FiltroFechasPedidos
        rango={filtros.rango}
        onCambiar={(rango) => onCambiar({ ...filtros, rango })}
        mostrados={mostradosPorFecha}
        total={total}
        nombres={{ singular: "registro", plural: "registros" }}
      />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Select
            label="Tipo de acción"
            id="filtro-accion"
            name="filtro-accion"
            value={filtros.accion}
            options={OPCIONES_ACCION}
            onChange={(evento) =>
              onCambiar({
                ...filtros,
                accion: evento.target.value as FiltroAccion,
              })
            }
          />

          <InputText
            label="Buscar"
            id="filtro-busqueda"
            type="search"
            placeholder="Usuario, justificación, entidad…"
            value={filtros.busqueda}
            onChange={(evento) =>
              onCambiar({ ...filtros, busqueda: evento.target.value })
            }
          />

          {/* Interruptor HU-15: cancelaciones y ajustes manuales de existencias. */}
          <div className="lg:pb-2">
            <button
              type="button"
              onClick={() =>
                onCambiar({ ...filtros, soloCriticas: !filtros.soloCriticas })
              }
              aria-pressed={filtros.soloCriticas}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                filtros.soloCriticas
                  ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-900/30 dark:text-amber-300"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
              Solo cancelaciones y ajustes
            </button>
          </div>

          {hayFiltrosActivos(filtros) && (
            <div className="lg:pb-0.5">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => onCambiar(FILTROS_INICIALES)}
              >
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
