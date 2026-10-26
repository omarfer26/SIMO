"use client";

// Dashboard Operacional — Rotación de stock por producto (Recharts).
// Barras horizontales: los nombres del catálogo se leen mejor en el eje Y, y
// el color dice de un vistazo si el producto rota alto, medio, bajo o si no
// tuvo movimiento en el período.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatearIndice, formatoMoneda, formatoNumero } from "@/lib/dashboard/formato";
import {
  TOP_ROTACION,
  UMBRAL_ROTACION_ALTA,
  UMBRAL_ROTACION_MEDIA,
} from "@/lib/dashboard/metricas";
import type { ClasificacionRotacion, RotacionProducto } from "@/lib/dashboard/tipos";
import { COLOR_ROTACION, ETIQUETA_ROTACION, recortar } from "./rotacion";
import { useTemaOscuro } from "./useTemaOscuro";

interface GraficoRotacionStockProps {
  datos: RotacionProducto[];
}

interface FilaRotacion extends RotacionProducto {
  etiqueta: string;
}

// La leyenda muestra siempre los tres niveles, con su umbral, aunque el top
// del gráfico sea todo "Alta": es lo que le da sentido al color. El tono de
// "sin movimiento" no se explica acá porque esos productos no entran al
// gráfico (aparecen en la tabla).
const ESCALA_ROTACION: { clasificacion: ClasificacionRotacion; detalle: string }[] = [
  { clasificacion: "alta", detalle: `≥ ${formatearIndice(UMBRAL_ROTACION_ALTA)}` },
  { clasificacion: "media", detalle: `≥ ${formatearIndice(UMBRAL_ROTACION_MEDIA)}` },
  { clasificacion: "baja", detalle: `< ${formatearIndice(UMBRAL_ROTACION_MEDIA)}` },
];

export default function GraficoRotacionStock({ datos }: GraficoRotacionStockProps) {
  const oscuro = useTemaOscuro();
  const colorGrilla = oscuro ? "#3f3f46" : "#e4e4e7";
  const colorTexto = oscuro ? "#a1a1aa" : "#71717a";

  // Solo entra al gráfico lo que tuvo movimiento; lo que no se vendió se ve
  // en la tabla (con la etiqueta "Sin movimiento").
  const filas: FilaRotacion[] = datos
    .filter((producto) => producto.unidadesVendidas > 0)
    .slice(0, TOP_ROTACION)
    .map((producto) => ({ ...producto, etiqueta: recortar(producto.nombre) }));

  if (filas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Ningún producto tuvo ventas en este período.
      </p>
    );
  }

  // El eje se estira un poco más allá del valor máximo para que la barra más
  // larga no quede pegada al borde.
  const maximo = Math.max(...filas.map((fila) => fila.indiceRotacion));

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={filas}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
            barCategoryGap="24%"
          >
            <CartesianGrid stroke={colorGrilla} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, Number((maximo * 1.15).toFixed(2))]}
              tick={{ fill: colorTexto, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(valor: number) => formatearIndice(valor)}
            />
            <YAxis
              type="category"
              dataKey="etiqueta"
              width={136}
              tick={{ fill: colorTexto, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: oscuro ? "rgba(255,255,255,0.06)" : "rgba(24,24,27,0.05)" }}
              content={(props) => <TooltipRotacion {...props} />}
            />
            <Bar dataKey="indiceRotacion" name="Rotación" radius={[0, 4, 4, 0]} barSize={16}>
              {filas.map((fila) => (
                <Cell
                  key={fila.idProducto}
                  fill={COLOR_ROTACION[fila.clasificacion]}
                  aria-label={`${fila.nombre}: ${fila.clasificacion}`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="text-zinc-500 dark:text-zinc-500">Índice de rotación:</span>
        {ESCALA_ROTACION.map((nivel) => (
          <span key={nivel.clasificacion} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLOR_ROTACION[nivel.clasificacion] }}
              aria-hidden="true"
            />
            {ETIQUETA_ROTACION[nivel.clasificacion]}
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {nivel.detalle}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TooltipRotacion({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  const fila = payload[0].payload as FilaRotacion;

  return (
    <div className="max-w-[240px] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{fila.nombre}</p>
      <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        {fila.codigo} · {fila.categoria}
      </p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-300">
        Rotación: <strong>{formatearIndice(fila.indiceRotacion)}</strong>
      </p>
      <p className="text-zinc-600 dark:text-zinc-300">
        Vendidas: {formatoNumero.format(fila.unidadesVendidas)} und. ·{" "}
        {formatoMoneda.format(fila.ingresos)}
      </p>
      <p className="text-zinc-500 dark:text-zinc-400">
        Stock actual: {formatoNumero.format(fila.stockActual)} und.
      </p>
    </div>
  );
}
