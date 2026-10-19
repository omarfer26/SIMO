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
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { listarPedidos, mensajeErrorPedidos } from "@/lib/pedidos/pedidosService";
import { NOMBRES_ESTADO, type EstadoPedido, type Pedido } from "@/lib/pedidos/tipos";

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

const columnas: ColumnaTabla<Pedido>[] = [
  {
    key: "id",
    header: "N.º",
    accessor: (p) => p.id,
    render: (p) => <span className="font-medium">#{p.id}</span>,
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
];

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
  // Cada vez que este número cambia, se vuelve a pedir la lista.
  const [recarga, setRecarga] = useState(0);
  const [rango, setRango] = useState<RangoFechas>(RANGO_VACIO);
  const pedidosFiltrados =
    lista.tipo === "lista" ? filtrarPorFechas(lista.pedidos, rango) : [];

  useEffect(() => {
    // Si la página se cierra (o se pide otra recarga) antes de que llegue la
    // respuesta, `vigente` evita pintar un resultado viejo.
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Gestión de Pedidos
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Visualización y trazabilidad de los pedidos.
      </p>

      <div className="mt-8">
        {lista.tipo === "cargando" && <ListaCargando />}

        {lista.tipo === "error" && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
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
          <div className="flex flex-col gap-4">
            <FiltroFechasPedidos
              rango={rango}
              onCambiar={setRango}
              mostrados={pedidosFiltrados.length}
              total={lista.pedidos.length}
            />
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
          </div>
        )}
      </div>
    </main>
  );
}
