"use client";

// Tablero Visual Kanban de Estados de Pedidos
// Agrupa los pedidos en columnas por estado progresivo y cancelados.
// Permite mover pedidos al siguiente estado con un clic directo o ver su línea de tiempo.

import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  CICLO_PROGRESIVO,
  NOMBRES_ESTADO,
  TRANSICIONES_VALIDAS,
  type EstadoPedido,
  type Pedido,
} from "@/lib/pedidos/tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
});

interface TableroEstadosPedidosProps {
  pedidos: Pedido[];
  onCambiarEstado: (idPedido: number, nuevoEstado: EstadoPedido) => Promise<void>;
  onSeleccionarPedido: (pedido: Pedido) => void;
  pedidoSeleccionadoId?: number | null;
}

const colorColumna: Record<EstadoPedido, { badge: BadgeVariant; border: string; headerBg: string }> = {
  REGISTRADO: {
    badge: "default",
    border: "border-zinc-200 dark:border-zinc-800",
    headerBg: "bg-zinc-50 dark:bg-zinc-800/60",
  },
  CONFIRMADO: {
    badge: "primary",
    border: "border-blue-200 dark:border-blue-900/40",
    headerBg: "bg-blue-50/60 dark:bg-blue-950/30",
  },
  EN_PREPARACION: {
    badge: "warning",
    border: "border-amber-200 dark:border-amber-900/40",
    headerBg: "bg-amber-50/60 dark:bg-amber-950/30",
  },
  LISTO: {
    badge: "info",
    border: "border-sky-200 dark:border-sky-900/40",
    headerBg: "bg-sky-50/60 dark:bg-sky-950/30",
  },
  ENTREGADO: {
    badge: "success",
    border: "border-emerald-200 dark:border-emerald-900/40",
    headerBg: "bg-emerald-50/60 dark:bg-emerald-950/30",
  },
  CANCELADO: {
    badge: "danger",
    border: "border-red-200 dark:border-red-900/40",
    headerBg: "bg-red-50/60 dark:bg-red-950/30",
  },
};

export default function TableroEstadosPedidos({
  pedidos,
  onCambiarEstado,
  onSeleccionarPedido,
  pedidoSeleccionadoId,
}: TableroEstadosPedidosProps) {
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);

  // Columnas a mostrar: el ciclo progresivo más la columna de cancelados
  const columnasTablero: EstadoPedido[] = [...CICLO_PROGRESIVO, "CANCELADO"];

  const moverSiguiente = async (e: React.MouseEvent, pedido: Pedido) => {
    e.stopPropagation();
    const siguiente = TRANSICIONES_VALIDAS[pedido.estado]?.find((st) => st !== "CANCELADO");
    if (!siguiente || actualizandoId === pedido.id) return;

    setActualizandoId(pedido.id);
    try {
      await onCambiarEstado(pedido.id, siguiente);
    } finally {
      setActualizandoId(null);
    }
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="grid grid-flow-col auto-cols-[280px] sm:auto-cols-[300px] gap-4 min-h-[500px]">
        {columnasTablero.map((estado) => {
          const pedidosColumna = pedidos.filter((p) => p.estado === estado);
          const estilo = colorColumna[estado];

          return (
            <div
              key={estado}
              className={`flex flex-col rounded-xl border ${estilo.border} bg-zinc-50/40 dark:bg-zinc-900/40 shadow-2xs overflow-hidden`}
            >
              {/* Encabezado de Columna */}
              <div
                className={`p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between ${estilo.headerBg}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                    {NOMBRES_ESTADO[estado]}
                  </span>
                  <Badge variant={estilo.badge} size="sm" pill>
                    {pedidosColumna.length}
                  </Badge>
                </div>
              </div>

              {/* Lista de Tarjetas del Estado */}
              <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[650px]">
                {pedidosColumna.length === 0 ? (
                  <div className="py-10 text-center text-xs text-zinc-400 dark:text-zinc-500 italic">
                    Sin pedidos en este estado
                  </div>
                ) : (
                  pedidosColumna.map((pedido) => {
                    const esSeleccionado = pedido.id === pedidoSeleccionadoId;
                    const transiciones = TRANSICIONES_VALIDAS[pedido.estado] || [];
                    const siguienteEstado = transiciones.find((e) => e !== "CANCELADO");
                    const estaCargando = actualizandoId === pedido.id;

                    return (
                      <div
                        key={pedido.id}
                        onClick={() => onSeleccionarPedido(pedido)}
                        className={`rounded-lg border bg-white p-3.5 shadow-2xs transition-all cursor-pointer hover:shadow-md dark:bg-zinc-800 ${
                          esSeleccionado
                            ? "border-emerald-500 ring-2 ring-emerald-400/40 dark:border-emerald-500"
                            : "border-zinc-200 dark:border-zinc-700/70 hover:border-zinc-300 dark:hover:border-zinc-600"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                            #{pedido.id}
                          </span>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Entrega: {formatoFechaCorta.format(pedido.fechaEntregaPactada)}
                          </span>
                        </div>

                        <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                          {pedido.cliente}
                        </p>

                        <div className="mt-2 flex items-center justify-between text-xs border-t border-zinc-100 dark:border-zinc-700/60 pt-2">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatoMoneda.format(pedido.total)}
                          </span>
                          <span className="text-[11px] text-zinc-500 truncate max-w-[120px]">
                            {pedido.registradoPor}
                          </span>
                        </div>

                        {/* Botón rápido para avanzar al siguiente estado */}
                        {siguienteEstado && (
                          <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-700/60 flex justify-end">
                            <Button
                              variant="secondary"
                              className="text-[11px] py-1 px-2.5 h-auto flex items-center gap-1.5 w-full justify-center font-medium"
                              disabled={estaCargando}
                              onClick={(e) => moverSiguiente(e, pedido)}
                            >
                              {estaCargando ? (
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                              ) : (
                                <>
                                  <span>Mover a {NOMBRES_ESTADO[siguienteEstado]}</span>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
