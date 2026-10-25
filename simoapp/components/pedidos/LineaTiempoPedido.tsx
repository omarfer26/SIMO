"use client";

// Componente de Línea de Tiempo Interactiva para un Pedido
// Muestra visualmente las etapas del ciclo de vida:
// REGISTRADO -> CONFIRMADO -> EN_PREPARACION -> LISTO -> ENTREGADO
// (o estado CANCELADO). Permite accionar el cambio al siguiente estado
// o cancelar con confirmación.

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  CICLO_PROGRESIVO,
  NOMBRES_ESTADO,
  TRANSICIONES_VALIDAS,
  type EstadoPedido,
  type Pedido,
} from "@/lib/pedidos/tipos";

interface LineaTiempoPedidoProps {
  pedido: Pedido;
  onCambiarEstado: (idPedido: number, nuevoEstado: EstadoPedido) => Promise<void>;
  disabled?: boolean;
}

const DESCRIPCION_ETAPA: Record<EstadoPedido, string> = {
  REGISTRADO: "Pedido tomado por el cliente y registrado en el sistema.",
  CONFIRMADO: "Pedido verificado y aprobado para surtido.",
  EN_PREPARACION: "Mercancía siendo separada y empacada en bodega.",
  LISTO: "Listo para recogida o despacho al cliente.",
  ENTREGADO: "Pedido entregado a satisfacción al cliente.",
  CANCELADO: "El pedido fue cancelado y no continuará su curso.",
};

const ICONO_ETAPA: Record<EstadoPedido, string> = {
  REGISTRADO: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  CONFIRMADO: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  EN_PREPARACION: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  LISTO: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
  ENTREGADO: "M5 13l4 4L19 7",
  CANCELADO: "M6 18L18 6M6 6l12 12",
};

export default function LineaTiempoPedido({
  pedido,
  onCambiarEstado,
  disabled = false,
}: LineaTiempoPedidoProps) {
  const [procesando, setProcesando] = useState(false);
  const transiciones = TRANSICIONES_VALIDAS[pedido.estado] || [];

  // Próximo estado progresivo (sin contar CANCELADO)
  const siguienteEstado = transiciones.find((e) => e !== "CANCELADO");
  const puedeCancelar = transiciones.includes("CANCELADO");

  // Índice actual en el flujo progresivo (-1 si cancelado)
  const indiceActual = CICLO_PROGRESIVO.indexOf(pedido.estado);
  const esCancelado = pedido.estado === "CANCELADO";

  const manejarCambio = async (nuevoEstado: EstadoPedido) => {
    if (procesando || disabled) return;
    setProcesando(true);
    try {
      await onCambiarEstado(pedido.id, nuevoEstado);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Aviso si está Cancelado */}
      {esCancelado && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONO_ETAPA.CANCELADO} />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Pedido Cancelado</p>
            <p className="text-xs text-red-700 dark:text-red-400">
              Este pedido fue cancelado y su flujo de despacho se encuentra detenido.
            </p>
          </div>
        </div>
      )}

      {/* Línea de Tiempo Visual */}
      <div className="relative py-2">
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:gap-2">
          {CICLO_PROGRESIVO.map((estado, idx) => {
            const esPasado = !esCancelado && idx < indiceActual;
            const esActual = !esCancelado && idx === indiceActual;
            const esFuturo = !esCancelado && idx > indiceActual;

            let colorCirculo = "bg-zinc-100 text-zinc-400 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700";
            let colorTexto = "text-zinc-500 dark:text-zinc-400";
            let colorBarra = "bg-zinc-200 dark:bg-zinc-800";

            if (esCancelado) {
              colorCirculo = "bg-zinc-100 text-zinc-300 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-700 dark:border-zinc-800 opacity-60";
              colorTexto = "text-zinc-400 dark:text-zinc-600";
            } else if (esPasado) {
              colorCirculo = "bg-emerald-600 text-white border-emerald-600 shadow-xs";
              colorTexto = "text-emerald-700 dark:text-emerald-400 font-medium";
              colorBarra = "bg-emerald-600";
            } else if (esActual) {
              colorCirculo = "bg-emerald-100 text-emerald-700 border-emerald-500 ring-4 ring-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-500 dark:ring-emerald-950/50 shadow-sm";
              colorTexto = "text-emerald-600 dark:text-emerald-400 font-bold";
            }

            return (
              <li key={estado} className="relative flex flex-col items-start sm:items-center text-left sm:text-center">
                {/* Conector horizontal para pantallas medianas/grandes */}
                {idx < CICLO_PROGRESIVO.length - 1 && (
                  <div
                    className={`hidden sm:block absolute top-5 left-1/2 w-full h-1 -translate-y-1/2 z-0 transition-colors duration-300 ${
                      esPasado ? colorBarra : "bg-zinc-200 dark:bg-zinc-800"
                    }`}
                  />
                )}

                {/* Ícono de Estado / Círculo */}
                <div
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${colorCirculo}`}
                  title={`${NOMBRES_ESTADO[estado]}: ${DESCRIPCION_ETAPA[estado]}`}
                >
                  {esPasado ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONO_ETAPA[estado]} />
                    </svg>
                  )}
                </div>

                {/* Etiquetas */}
                <div className="mt-2.5 space-y-0.5">
                  <p className={`text-xs uppercase tracking-wider ${colorTexto}`}>
                    {NOMBRES_ESTADO[estado]}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 max-w-[140px] hidden sm:block">
                    {DESCRIPCION_ETAPA[estado]}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Controles Interactivos de Acción */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
        <div>
          <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block font-semibold">
            Estado Actual
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {NOMBRES_ESTADO[pedido.estado]}
            </span>
            <Badge
              variant={
                pedido.estado === "ENTREGADO"
                  ? "success"
                  : pedido.estado === "CANCELADO"
                  ? "danger"
                  : "primary"
              }
              size="sm"
              pill
            >
              Etapa {esCancelado ? "Finalizada" : `${indiceActual + 1} de 5`}
            </Badge>
          </div>
        </div>

        {/* Botones de Cambio de Estado */}
        <div className="flex items-center gap-2.5">
          {puedeCancelar && (
            <Button
              variant="danger"
              className="text-xs py-2 px-3"
              disabled={procesando || disabled}
              onClick={() => {
                if (window.confirm(`¿Estás seguro de cancelar el pedido #${pedido.id}?`)) {
                  manejarCambio("CANCELADO");
                }
              }}
            >
              Cancelar Pedido
            </Button>
          )}

          {siguienteEstado ? (
            <Button
              variant="primary"
              className="text-xs py-2 px-4 flex items-center gap-2 shadow-sm font-semibold"
              disabled={procesando || disabled}
              onClick={() => manejarCambio(siguienteEstado)}
            >
              {procesando ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Actualizando...</span>
                </>
              ) : (
                <>
                  <span>Avanzar a: {NOMBRES_ESTADO[siguienteEstado]}</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </Button>
          ) : (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Ciclo Completado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
