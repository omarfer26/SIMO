"use client";

// Componente de Línea de Tiempo Interactiva para un Pedido
// Muestra visualmente las etapas del ciclo de vida:
// REGISTRADO -> CONFIRMADO -> EN_PREPARACION -> LISTO -> ENTREGADO
// (o estado CANCELADO). Permite accionar el cambio al siguiente estado
// o cancelar con confirmación.
//
// EP-04 — Las acciones dependen del rol (lib/auth/permisos.ts): el Vendedor
// mueve todo el ciclo y cancela, el Encargado de Inventario solo alista y el
// Administrador y el Gerente únicamente miran la trazabilidad.
//
// SCRUM-159 (Camilo) — Cancelar ya no usa las ventanitas del navegador
// (window.prompt / window.alert). "Cancelar Pedido" abre, en esta misma
// tarjeta, un panel en dos pasos:
//  1. "motivo": se escribe el motivo (obligatorio, máx. 500 caracteres).
//  2. "confirmar": aviso rojo con el resumen (cliente, total, estado, si el
//     stock vuelve o no al inventario, motivo). Recién "Sí, cancelar pedido"
//     llama a onCambiarEstado. Si el backend falla, el error se muestra aquí
//     mismo y se puede reintentar o volver.

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import ConfirmacionDestructiva from "@/components/ui/ConfirmacionDestructiva";
import { useProductos } from "@/components/catalogo/ProductosContext";
import { mensajeErrorCambioEstado } from "@/lib/pedidos/pedidosService";
import {
  CICLO_PROGRESIVO,
  NOMBRES_ESTADO,
  TRANSICIONES_VALIDAS,
  type EstadoPedido,
  type Pedido,
} from "@/lib/pedidos/tipos";

interface LineaTiempoPedidoProps {
  pedido: Pedido;
  onCambiarEstado: (
    idPedido: number,
    nuevoEstado: EstadoPedido,
    motivo?: string,
  ) => Promise<void>;
  /** EP-04 — Estados a los que el rol de la sesión puede mover el pedido. Si
   *  no llega, se asume el ciclo completo (Vendedor); vacío = solo consulta. */
  estadosPermitidos?: readonly EstadoPedido[];
  /** EP-04 — La cancelación exige motivo y no es de todos los roles: el
   *  Inventario alista pero no cancela. */
  permiteCancelar?: boolean;
}

// Avances del ciclo que puede aplicar el rol que opera los pedidos.
const AVANCES_COMPLETOS: readonly EstadoPedido[] = [
  "CONFIRMADO",
  "EN_PREPARACION",
  "LISTO",
  "ENTREGADO",
];

const DESCRIPCION_ETAPA: Record<EstadoPedido, string> = {
  REGISTRADO: "Pedido tomado por el cliente y registrado en el sistema.",
  CONFIRMADO: "Pedido verificado y aprobado para surtido.",
  EN_PREPARACION: "Mercancía siendo separada y empacada en bodega. Se reserva el stock del catálogo.",
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

// SCRUM-159 — Igual que el backend (POST /api/orders/:id/cancel).
const MAX_MOTIVO = 500;

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** SCRUM-159 — Panel de cancelación: cerrado, escribiendo el motivo o confirmando. */
type PasoCancelacion = null | "motivo" | "confirmar";

export default function LineaTiempoPedido({
  pedido,
  onCambiarEstado,
  estadosPermitidos = AVANCES_COMPLETOS,
  permiteCancelar = true,
}: LineaTiempoPedidoProps) {
  const [procesando, setProcesando] = useState(false);
  // SCRUM-159 — Estado del panel de cancelación.
  const [pasoCancelacion, setPasoCancelacion] = useState<PasoCancelacion>(null);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null);
  const { productos } = useProductos();
  const transiciones = TRANSICIONES_VALIDAS[pedido.estado] || [];

  // Próximo estado progresivo que este rol puede aplicar (sin contar CANCELADO)
  const siguienteEstado = transiciones.find(
    (e) => e !== "CANCELADO" && estadosPermitidos.includes(e),
  );
  const puedeCancelar = permiteCancelar && transiciones.includes("CANCELADO");
  // El pedido ya cerró su ciclo (ENTREGADO) o fue cancelado.
  const finDelCiclo = transiciones.length === 0;

  // Índice actual en el flujo progresivo (-1 si cancelado)
  const indiceActual = CICLO_PROGRESIVO.indexOf(pedido.estado);
  const esCancelado = pedido.estado === "CANCELADO";

  const manejarCambio = async (nuevoEstado: EstadoPedido, motivo?: string) => {
    if (procesando) return;
    setProcesando(true);
    try {
      await onCambiarEstado(pedido.id, nuevoEstado, motivo);
    } finally {
      setProcesando(false);
    }
  };

  // SCRUM-159 — Cerrar el panel borra lo escrito.
  const cerrarCancelacion = () => {
    if (procesando) return;
    setPasoCancelacion(null);
    setMotivo("");
    setErrorMotivo(null);
    setErrorCancelacion(null);
  };

  // Paso 1 → paso 2: solo valida el motivo.
  const revisarCancelacion = (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = motivo.trim();
    if (!limpio) {
      setErrorMotivo("Escribe el motivo de la cancelación.");
      return;
    }
    if (limpio.length > MAX_MOTIVO) {
      setErrorMotivo(`El motivo admite máximo ${MAX_MOTIVO} caracteres.`);
      return;
    }
    setErrorMotivo(null);
    setErrorCancelacion(null);
    setPasoCancelacion("confirmar");
  };

  // Paso 2: "Sí, cancelar pedido". La página lanza el error si el backend
  // rechaza, para mostrarlo aquí sin cerrar el panel.
  const confirmarCancelacion = async () => {
    if (procesando) return;
    setProcesando(true);
    setErrorCancelacion(null);
    try {
      await onCambiarEstado(pedido.id, "CANCELADO", motivo.trim());
      setPasoCancelacion(null);
      setMotivo("");
    } catch (err) {
      setErrorCancelacion(mensajeErrorCambioEstado(err));
    } finally {
      setProcesando(false);
    }
  };

  // Nombre del producto para el resumen (las líneas solo traen el id).
  const nombreProducto = (idProducto: number) =>
    productos.find((p) => p.id === idProducto)?.nombre ?? `Producto #${idProducto}`;

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

      {/* SCRUM-159 — Panel de cancelación en dos pasos (reemplaza los controles mientras está abierto) */}
      {pasoCancelacion === "motivo" && (
        <form
          onSubmit={revisarCancelacion}
          noValidate
          className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4 dark:border-red-900/40 dark:bg-red-950/20"
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Cancelar el pedido #{pedido.id}
          </p>
          <div>
            <label
              htmlFor={`motivo-cancelacion-${pedido.id}`}
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
            >
              Motivo de la cancelación <span className="text-red-500">*</span>
            </label>
            <textarea
              id={`motivo-cancelacion-${pedido.id}`}
              rows={3}
              autoFocus
              value={motivo}
              maxLength={MAX_MOTIVO}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (errorMotivo) setErrorMotivo(null);
              }}
              placeholder="Ej: el cliente ya no necesita los productos, no se pudo contactar al cliente…"
              aria-invalid={Boolean(errorMotivo)}
              aria-describedby={`ayuda-motivo-${pedido.id}`}
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 ${
                errorMotivo
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-zinc-300 focus:border-emerald-500 focus:ring-emerald-500 dark:border-zinc-700"
              }`}
            />
            <p
              id={`ayuda-motivo-${pedido.id}`}
              className={`mt-1 flex justify-between gap-2 text-xs ${errorMotivo ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              <span role={errorMotivo ? "alert" : undefined}>
                {errorMotivo ?? "Queda en el historial del pedido y en la auditoría."}
              </span>
              <span className="shrink-0 tabular-nums">
                {motivo.length}/{MAX_MOTIVO}
              </span>
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={cerrarCancelacion}>
              Volver
            </Button>
            <Button type="submit" variant="danger">
              Revisar cancelación
            </Button>
          </div>
        </form>
      )}

      {pasoCancelacion === "confirmar" && (
        <ConfirmacionDestructiva
          titulo={`¿Cancelar el pedido #${pedido.id}?`}
          textoConfirmar="Sí, cancelar pedido"
          textoProcesando="Cancelando…"
          procesando={procesando}
          error={errorCancelacion}
          onConfirmar={confirmarCancelacion}
          onVolver={() => {
            setErrorCancelacion(null);
            setPasoCancelacion("motivo");
          }}
        >
          <div className="flex justify-between gap-3">
            <span>Cliente</span>
            <span className="text-right font-medium text-zinc-900 dark:text-zinc-100">{pedido.cliente}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Total del pedido</span>
            <span className="font-bold text-red-600 dark:text-red-400">{formatoMoneda.format(pedido.total)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Estado actual</span>
            <span className="font-medium">{NOMBRES_ESTADO[pedido.estado]}</span>
          </div>
          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700/60">
            {pedido.stockReservado ? (
              <>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  El stock que se apartó para este pedido vuelve al inventario
                  {pedido.lineas && pedido.lineas.length > 0 ? ":" : "."}
                </p>
                {pedido.lineas && pedido.lineas.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {pedido.lineas.map((l) => (
                      <li key={l.idProducto}>
                        {l.cantidad} × {nombreProducto(l.idProducto)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>Este pedido todavía no había descontado stock: el inventario no cambia.</p>
            )}
          </div>
          <p className="border-t border-zinc-200 pt-2 dark:border-zinc-700/60">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Motivo:</span>{" "}
            <span className="break-words">{motivo.trim()}</span>
          </p>
        </ConfirmacionDestructiva>
      )}

      {/* Controles Interactivos de Acción */}
      {pasoCancelacion === null && (
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
              disabled={procesando}
              // CU-13 EX-2: la cancelación exige motivo escrito; queda en el
              // historial del pedido y en la auditoría inalterable (HU-15).
              // SCRUM-159 — Abre el panel de dos pasos (antes, window.prompt).
              onClick={() => setPasoCancelacion("motivo")}
            >
              Cancelar Pedido
            </Button>
          )}

          {siguienteEstado ? (
            <Button
              variant="primary"
              className="text-xs py-2 px-4 flex items-center gap-2 shadow-sm font-semibold"
              disabled={procesando}
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
          ) : finDelCiclo ? (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Ciclo Completado
            </span>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}
