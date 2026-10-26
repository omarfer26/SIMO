"use client";

// Dashboard Operacional — Participación de cada medio de pago en los
// ingresos del período. Donut (Recharts) para ver el reparto de un vistazo y
// lista al lado para el detalle en pesos, que es lo que interesa en caja.

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import { formatoMoneda, formatoNumero, formatearPorcentaje } from "@/lib/dashboard/formato";
import type { UsoMetodoPago } from "@/lib/dashboard/tipos";

const PALETA = ["#10b981", "#6366f1", "#f59e0b", "#0ea5e9", "#f43f5e", "#84cc16"];

interface GraficoMetodosPagoProps {
  datos: UsoMetodoPago[];
  /** Ingresos totales del período, para el centro del donut. */
  total: number;
}

export default function GraficoMetodosPago({ datos, total }: GraficoMetodosPagoProps) {
  if (datos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Sin cobros registrados en este período.
      </p>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={datos}
              dataKey="total"
              nameKey="nombre"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="none"
            >
              {datos.map((dato, indice) => (
                <Cell key={dato.metodo} fill={PALETA[indice % PALETA.length]} />
              ))}
            </Pie>
            <Tooltip content={(props) => <TooltipMetodo {...props} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centro del donut: el total cobrado en el período. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Cobrado
          </span>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {formatoMoneda.format(total)}
          </span>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {datos.map((dato, indice) => (
          <li key={dato.metodo} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: PALETA[indice % PALETA.length] }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                {dato.nombre}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {formatoNumero.format(dato.ventas)}{" "}
                {dato.ventas === 1 ? "venta" : "ventas"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatoMoneda.format(dato.total)}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {formatearPorcentaje(dato.porcentaje)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TooltipMetodo({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const dato = payload[0].payload as UsoMetodoPago;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{dato.nombre}</p>
      <p className="mt-1 text-emerald-600 dark:text-emerald-400">
        {formatoMoneda.format(dato.total)} · {formatearPorcentaje(dato.porcentaje)}
      </p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {formatoNumero.format(dato.ventas)} {dato.ventas === 1 ? "venta" : "ventas"}
      </p>
    </div>
  );
}
