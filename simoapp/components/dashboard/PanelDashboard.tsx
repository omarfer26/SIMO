// Dashboard Operacional — Tarjeta contenedora de cada panel del tablero.
// Unifica el borde, el fondo, el título y el subtítulo para que los cuatro
// paneles se vean iguales en claro y en oscuro.

import type { ReactNode } from "react";

interface PanelDashboardProps {
  titulo: string;
  descripcion?: string;
  /** Controles a la derecha del título (selector de período, leyendas...). */
  acciones?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function PanelDashboard({
  titulo,
  descripcion,
  acciones,
  className = "",
  children,
}: PanelDashboardProps) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{titulo}</h2>
          {descripcion && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{descripcion}</p>
          )}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}
