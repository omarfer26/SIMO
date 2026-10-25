"use client";

// SCRUM-125 (Camilo) — Página de Gestión de Pedidos. Antes solo tenía el
// título; ahora:
//  - Tabla con la lista de pedidos (DataTable de components/ui), del más
//    reciente al más antiguo. Por ahora con datos de prueba: ver
//    lib/pedidos/pedidosService.ts para pasar a la API real.
//  - Filtro por rango de fechas Desde / Hasta arriba de la tabla
//    (components/pedidos/FiltroFechasPedidos.tsx). La tabla se actualiza
//    apenas se elige una fecha, sin botón "Buscar". Filtra por la fecha de
//    solicitud (cuándo se hizo el pedido).
//  - Mientras carga se ven cuadros grises; si falla, el error con un botón
//    para reintentar; si ningún pedido cae en el rango, un mensaje con el
//    botón "Limpiar filtro".

import { useEffect, useState } from "react";
import FiltroFechasPedidos, {
  RANGO_VACIO,
  filtrarPorFechas,
  hayRango,
  type RangoFechas,
} from "@/components/pedidos/FiltroFechasPedidos";
import LineaTiempoPedido from "@/components/pedidos/LineaTiempoPedido";
import TableroEstadosPedidos from "@/components/pedidos/TableroEstadosPedidos";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  actualizarEstadoPedido,
  listarPedidos,
  mensajeErrorPedidos,
} from "@/lib/pedidos/pedidosService";
import {
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

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const formatoHora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

// Color de la etiqueta de cada estado: gris al inicio, verde al entregar,
// rojo si se canceló.
const colorEstado: Record<EstadoPedido, BadgeVariant> = {
  REGISTRADO: "default",
  CONFIRMADO: "primary",
  EN_PREPARACION: "warning",
  LISTO: "info",
  ENTREGADO: "success",
  CANCELADO: "danger",
};

// La lista puede estar en uno de tres momentos, y solo en uno a la vez.
type EstadoLista =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; pedidos: Pedido[] };

// Cuadros grises con la forma del filtro y de la tabla, mientras llega la lista.
function ListaCargando() {
  return (
    <div role="status" aria-label="Cargando pedidos" className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Skeleton className="h-16 w-44" />
        <Skeleton className="h-16 w-44" />
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid grid-cols-4 items-center gap-4 px-6 py-4">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PedidosPage() {
  const [lista, setLista] = useState<EstadoLista>({ tipo: "cargando" });
  const [recarga, setRecarga] = useState(0);
  const [rango, setRango] = useState<RangoFechas>(RANGO_VACIO);
  const [vista, setVista] = useState<"tablero" | "tabla">("tablero");
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<Pedido | null>(null);
  const [avisoExito, setAvisoExito] = useState<string | null>(null);

  const pedidosFiltrados =
    lista.tipo === "lista" ? filtrarPorFechas(lista.pedidos, rango) : [];

  useEffect(() => {
    let vigente = true;
    listarPedidos()
      .then((pedidos) => {
        if (vigente) setLista({ tipo: "lista", pedidos });
      })
      .catch((error) => {
        if (vigente) setLista({ tipo: "error", mensaje: mensajeErrorPedidos(error) });
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  // Manejador centralizado para cambiar estado de un pedido
  const manejarCambiarEstado = async (idPedido: number, nuevoEstado: EstadoPedido) => {
    try {
      await actualizarEstadoPedido(idPedido, nuevoEstado);

      // Actualizar estado local
      setLista((prev) => {
        if (prev.tipo !== "lista") return prev;
        const pedidosActualizados = prev.pedidos.map((p) =>
          p.id === idPedido ? { ...p, estado: nuevoEstado } : p,
        );
        return { ...prev, pedidos: pedidosActualizados };
      });

      // Actualizar modal si está abierto con ese pedido
      setPedidoSeleccionado((actual) =>
        actual && actual.id === idPedido ? { ...actual, estado: nuevoEstado } : actual,
      );

      setAvisoExito(`Pedido #${idPedido} actualizado a "${NOMBRES_ESTADO[nuevoEstado]}".`);
      setTimeout(() => setAvisoExito(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al actualizar el estado del pedido.");
    }
  };

  const columnas: ColumnaTabla<Pedido>[] = [
    {
      key: "id",
      header: "N.º",
      accessor: (p) => p.id,
      render: (p) => <span className="font-mono font-medium">#{p.id}</span>,
      sortable: true,
    },
    { key: "cliente", header: "Cliente", accessor: (p) => p.cliente, sortable: true },
    {
      key: "fechaSolicitud",
      header: "Fecha de solicitud",
      accessor: (p) => p.fechaSolicitud,
      render: (p) => (
        <>
          {formatoFecha.format(p.fechaSolicitud)}
          <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
            {formatoHora.format(p.fechaSolicitud)}
          </span>
        </>
      ),
      sortable: true,
    },
    {
      key: "fechaEntregaPactada",
      header: "Entrega pactada",
      accessor: (p) => p.fechaEntregaPactada,
      render: (p) => formatoFecha.format(p.fechaEntregaPactada),
      sortable: true,
    },
    {
      key: "estado",
      header: "Estado",
      accessor: (p) => NOMBRES_ESTADO[p.estado],
      render: (p) => (
        <Badge variant={colorEstado[p.estado]} size="sm" pill>
          {NOMBRES_ESTADO[p.estado]}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      accessor: (p) => p.total,
      render: (p) => formatoMoneda.format(p.total),
      sortable: true,
    },
    { key: "registradoPor", header: "Registrado por", accessor: (p) => p.registradoPor, sortable: true },
    {
      key: "acciones",
      header: "Acción",
      align: "right",
      accessor: () => "",
      render: (p) => (
        <Button
          variant="secondary"
          className="text-xs py-1 px-2.5 h-auto"
          onClick={() => setPedidoSeleccionado(p)}
        >
          Línea de tiempo
        </Button>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
      {/* Toast de Éxito */}
      {avisoExito && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 border border-emerald-700">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium text-sm">{avisoExito}</span>
          </div>
        </div>
      )}

      {/* Encabezado y Selector de Vistas */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Gestión y Trazabilidad de Pedidos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Monitorea y cambia el estado de cada pedido a lo largo de su ciclo de vida.
          </p>
        </div>

        {/* Selector de Vista: Tablero Kanban o Lista en Tabla */}
        <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setVista("tablero")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              vista === "tablero"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-700 dark:text-emerald-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Tablero Visual (Kanban)
          </button>
          <button
            type="button"
            onClick={() => setVista("tabla")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              vista === "tabla"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-700 dark:text-emerald-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Tabla Detallada
          </button>
        </div>
      </div>

      {/* Panel Central */}
      <div className="mt-6">
        {lista.tipo === "cargando" && <ListaCargando />}

        {lista.tipo === "error" && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            <span>No se pudo cargar la lista de pedidos. {lista.mensaje}</span>
            <Button
              variant="secondary"
              onClick={() => {
                setLista({ tipo: "cargando" });
                setRecarga((n) => n + 1);
              }}
            >
              Reintentar
            </Button>
          </div>
        )}

        {lista.tipo === "lista" && (
          <div className="flex flex-col gap-6">
            <FiltroFechasPedidos
              rango={rango}
              onCambiar={setRango}
              mostrados={pedidosFiltrados.length}
              total={lista.pedidos.length}
            />

            {/* VISTA 1: TABLERO VISUAL KANBAN */}
            {vista === "tablero" && (
              <TableroEstadosPedidos
                pedidos={pedidosFiltrados}
                onCambiarEstado={manejarCambiarEstado}
                onSeleccionarPedido={(p) => setPedidoSeleccionado(p)}
                pedidoSeleccionadoId={pedidoSeleccionado?.id}
              />
            )}

            {/* VISTA 2: TABLA DETALLADA CON ACCIÓN DIRECTA */}
            {vista === "tabla" && (
              <DataTable
                columns={columnas}
                data={pedidosFiltrados}
                getRowKey={(p) => p.id}
                initialSort={{ key: "fechaSolicitud", direction: "desc" }}
                caption="Lista de pedidos"
                emptyMessage={
                  hayRango(rango) ? (
                    <span className="flex flex-col items-center gap-3">
                      No hay pedidos en ese período.
                      <Button variant="secondary" onClick={() => setRango(RANGO_VACIO)}>
                        Limpiar filtro
                      </Button>
                    </span>
                  ) : (
                    "Todavía no hay pedidos registrados."
                  )
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Modal con la Línea de Tiempo Interactiva del Pedido Seleccionado */}
      <Modal
        isOpen={Boolean(pedidoSeleccionado)}
        onClose={() => setPedidoSeleccionado(null)}
        title={`Trazabilidad - Pedido #${pedidoSeleccionado?.id}`}
        maxWidth="xl"
      >
        {pedidoSeleccionado && (
          <div className="space-y-6">
            {/* Cabecera Informativa del Pedido */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm">
              <div>
                <span className="text-xs text-zinc-500 block">Cliente</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {pedidoSeleccionado.cliente}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Fecha Solicitud</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {formatoFecha.format(pedidoSeleccionado.fechaSolicitud)}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Entrega Pactada</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {formatoFecha.format(pedidoSeleccionado.fechaEntregaPactada)}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Monto Total</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatoMoneda.format(pedidoSeleccionado.total)}
                </span>
              </div>
            </div>

            {/* Línea de Tiempo Interactiva */}
            <LineaTiempoPedido
              pedido={pedidoSeleccionado}
              onCambiarEstado={manejarCambiarEstado}
            />

            <div className="flex justify-end pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <Button variant="secondary" onClick={() => setPedidoSeleccionado(null)}>
                Cerrar Trazabilidad
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
