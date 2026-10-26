"use client";

// Dashboard Operacional — Gráfico de ventas por período (Recharts).
// Barras = ingresos del día o de la semana; línea = unidades vendidas. Se
// usan dos ejes porque los pesos y las unidades no comparten escala: si
// ambos van al mismo eje, la línea de unidades se aplasta contra el piso.

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatearEjeMoneda, formatoMoneda, formatoNumero } from "@/lib/dashboard/formato";
import type { PuntoSerieVentas } from "@/lib/dashboard/tipos";
import { useTemaOscuro } from "./useTemaOscuro";

interface GraficoVentasPeriodoProps {
  serie: PuntoSerieVentas[];
}

export default function GraficoVentasPeriodo({ serie }: GraficoVentasPeriodoProps) {
  const oscuro = useTemaOscuro();
  const colorGrilla = oscuro ? "#3f3f46" : "#e4e4e7";
  const colorTexto = oscuro ? "#a1a1aa" : "#71717a";
  const hayVentas = serie.some((punto) => punto.ventas > 0);

  return (
    <div>
      {/* Leyenda propia (en vez de <Legend />) para poder mostrarla también
          cuando el gráfico no tiene datos. */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
          Ingresos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-indigo-500" aria-hidden="true" />
          Unidades vendidas (eje derecho)
        </span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={serie} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={colorGrilla} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="etiqueta"
              tick={{ fill: colorTexto, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: colorGrilla }}
              minTickGap={12}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="ingresos"
              width={62}
              tick={{ fill: colorTexto, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(valor: number) => formatearEjeMoneda(valor)}
            />
            <YAxis
              yAxisId="unidades"
              orientation="right"
              width={38}
              allowDecimals={false}
              tick={{ fill: colorTexto, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: oscuro ? "rgba(255,255,255,0.06)" : "rgba(24,24,27,0.05)" }}
              content={(props) => <TooltipVentas {...props} />}
            />
            <Bar
              yAxisId="ingresos"
              dataKey="ingresos"
              name="Ingresos"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              maxBarSize={30}
            />
            <Line
              yAxisId="unidades"
              type="monotone"
              dataKey="unidades"
              name="Unidades"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {!hayVentas && (
        <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
          No hay ventas completadas en este período.
        </p>
      )}
    </div>
  );
}

function TooltipVentas({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const punto = payload[0].payload as PuntoSerieVentas;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{punto.etiqueta}</p>
      <p className="mt-1 text-emerald-600 dark:text-emerald-400">
        Ingresos: <strong>{formatoMoneda.format(punto.ingresos)}</strong>
      </p>
      <p className="text-zinc-600 dark:text-zinc-300">
        Unidades: {formatoNumero.format(punto.unidades)}
      </p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {formatoNumero.format(punto.ventas)} {punto.ventas === 1 ? "venta" : "ventas"}
      </p>
    </div>
  );
}
