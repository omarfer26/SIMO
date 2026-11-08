// Dashboard Operacional — Tarjeta de indicador (KPI) del tablero: un número
// grande que se lee de un vistazo, con el ícono del módulo al que pertenece y
// la variación frente al período anterior.

import type { ReactNode } from "react";
import { formatearPorcentaje } from "@/lib/dashboard/formato";

export type TonoMetrica = "emerald" | "sky" | "amber" | "violet" | "rose";

const clasesTono: Record<TonoMetrica, string> = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400",
};

interface TarjetaMetricaProps {
  titulo: string;
  valor: string;
  /** Ícono SVG (path con trazo) que acompaña al título. */
  icono: string;
  tono?: TonoMetrica;
  /** Variación % frente al período anterior; null si no hay con qué comparar. */
  variacion?: number | null;
  /** Aclaración que se muestra debajo del valor. */
  detalle?: ReactNode;
}

export default function TarjetaMetrica({
  titulo,
  valor,
  icono,
  tono = "emerald",
  variacion,
  detalle,
}: TarjetaMetricaProps) {
  const hayVariacion = variacion !== null && variacion !== undefined;
  // Si no se pasa la prop, el indicador no se compara con nada (por ejemplo,
  // la rotación promedio): no se muestra ninguna etiqueta de variación.
  const sinComparacion = variacion === undefined;
  // Con cero ventas en el período anterior no se puede hablar de "subió" o
  // "bajó": se avisa que no hay base de comparación.
  const sube = hayVariacion && variacion > 0;
  const igual = hayVariacion && Math.abs(variacion) < 0.05;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {titulo}
        </h3>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${clasesTono[tono]}`}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d={icono} />
          </svg>
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        {valor}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {sinComparacion ? null : hayVariacion ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
              igual
                ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                : sube
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-3 w-3 ${igual ? "hidden" : sube ? "" : "rotate-180"}`}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 17a.75.75 0 0 1-.75-.75V5.56L5.78 9.03a.75.75 0 1 1-1.06-1.06l4.75-4.75a.75.75 0 0 1 1.06 0l4.75 4.75a.75.75 0 1 1-1.06 1.06L10.75 5.56v10.69A.75.75 0 0 1 10 17Z"
                clipRule="evenodd"
              />
            </svg>
            {formatearPorcentaje(Math.abs(variacion), { conSigno: false })}
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Sin período previo
          </span>
        )}
        {detalle && <span className="text-zinc-500 dark:text-zinc-400">{detalle}</span>}
      </div>
    </article>
  );
}
