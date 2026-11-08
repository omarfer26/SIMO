"use client";

// HU-15 — Panel del Log de Auditoría Inalterable. Orquesta el estado (carga,
// filtros, registro abierto) y arma la tabla; la presentación fina vive en
// FiltrosAuditoria, la tabla base en components/ui/DataTable y el detalle en
// DetalleAuditoria. Es de solo lectura: acá no se crea, edita ni borra nada.

import { useEffect, useMemo, useState } from "react";
import {
  fechaEnRango,
  hayRango,
  rangoInvalido,
} from "@/components/pedidos/FiltroFechasPedidos";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  FILTROS_INICIALES,
  NOMBRES_ACCION,
  filtrarAuditoria,
  type EntradaAuditoria,
  type FiltrosAuditoria,
} from "@/lib/auditoria/tipos";
import { formatoFechaHoraAuditoria } from "@/lib/auditoria/formato";
import { listarAuditoria, mensajeErrorAuditoria } from "@/lib/auditoria/auditoriaService";
import { VARIANTE_ACCION } from "./estilos";
import FiltrosAuditoriaUI from "./FiltrosAuditoria";
import DetalleAuditoria from "./DetalleAuditoria";

type EstadoLista =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; entradas: EntradaAuditoria[] };

export default function PanelAuditoria() {
  const [lista, setLista] = useState<EstadoLista>({ tipo: "cargando" });
  const [recarga, setRecarga] = useState(0);
  const [filtros, setFiltros] = useState<FiltrosAuditoria>(FILTROS_INICIALES);
  const [detalle, setDetalle] = useState<EntradaAuditoria | null>(null);

  useEffect(() => {
    let vigente = true;
    listarAuditoria()
      .then((entradas) => {
        if (vigente) setLista({ tipo: "lista", entradas });
      })
      .catch((error) => {
        if (vigente) setLista({ tipo: "error", mensaje: mensajeErrorAuditoria(error) });
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  // Lista estable (misma referencia) para no recalcular los filtros en vano.
  const entradas = useMemo(
    () => (lista.tipo === "lista" ? lista.entradas : []),
    [lista],
  );

  // 1) Recorte por rango de fechas (utilidad compartida, igual que Kardex).
  const porFecha = useMemo(() => {
    if (!hayRango(filtros.rango) || rangoInvalido(filtros.rango)) return entradas;
    return entradas.filter((entrada) => fechaEnRango(entrada.fecha, filtros.rango));
  }, [entradas, filtros.rango]);

  // 2) El resto de filtros (acción, solo críticas, búsqueda) sobre lo anterior.
  const visibles = useMemo(() => filtrarAuditoria(porFecha, filtros), [porFecha, filtros]);

  // Columnas de la tabla. `setDetalle` es estable, así que el arreglo no cambia
  // entre renders y DataTable no reordena de más.
  const columnas = useMemo<ColumnaTabla<EntradaAuditoria>[]>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        accessor: (e) => e.fecha,
        sortable: true,
        render: (e) => (
          <span className="whitespace-nowrap text-zinc-700 dark:text-zinc-300">
            {formatoFechaHoraAuditoria(e.fecha)}
          </span>
        ),
      },
      {
        key: "accion",
        header: "Acción",
        accessor: (e) => NOMBRES_ACCION[e.accion],
        sortable: true,
        render: (e) => (
          <Badge variant={VARIANTE_ACCION[e.accion]} size="sm">
            {NOMBRES_ACCION[e.accion]}
          </Badge>
        ),
      },
      {
        key: "usuario",
        header: "Usuario",
        accessor: (e) => e.usuario,
        sortable: true,
      },
      {
        key: "entidad",
        header: "Entidad",
        accessor: (e) => e.entidad,
        sortable: true,
        render: (e) => (
          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {e.entidad} #{e.idEntidad}
          </span>
        ),
      },
      {
        key: "justificacion",
        header: "Justificación",
        accessor: (e) => e.justificacion ?? "",
        sortable: true,
        render: (e) => (
          <span
            className="block max-w-xs truncate text-zinc-600 dark:text-zinc-400"
            title={e.justificacion ?? undefined}
          >
            {e.justificacion ?? "—"}
          </span>
        ),
      },
      {
        key: "detalle",
        header: "",
        align: "right",
        render: (e) => (
          <button
            type="button"
            onClick={() => setDetalle(e)}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Ver
          </button>
        ),
      },
    ],
    [],
  );

  if (lista.tipo === "cargando") {
    return (
      <div className="space-y-4">
        <AvisoInalterable />
        <TablaCargando />
      </div>
    );
  }

  if (lista.tipo === "error") {
    return (
      <div className="space-y-4">
        <AvisoInalterable />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {lista.mensaje}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={() => setRecarga((n) => n + 1)}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AvisoInalterable />

      <FiltrosAuditoriaUI
        filtros={filtros}
        onCambiar={setFiltros}
        total={entradas.length}
        mostradosPorFecha={porFecha.length}
      />

      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
          {visibles.length}
        </strong>{" "}
        {visibles.length === 1 ? "registro" : "registros"}
        {visibles.length !== entradas.length ? ` de ${entradas.length}` : ""} en el log.
      </p>

      {visibles.length === 0 ? (
        <EstadoVacio
          hayFiltros={entradas.length > 0}
          onLimpiar={() => setFiltros(FILTROS_INICIALES)}
        />
      ) : (
        <DataTable
          columns={columnas}
          data={visibles}
          getRowKey={(e) => e.idLog}
          initialSort={{ key: "fecha", direction: "desc" }}
          pageSize={10}
          caption="Log de auditoría inalterable: operaciones críticas, quién las hizo y qué cambió."
          emptyMessage="No hay registros con estos filtros."
        />
      )}

      <DetalleAuditoria entrada={detalle} onCerrar={() => setDetalle(null)} />
    </div>
  );
}

// Franja que deja claro que la bitácora no se puede modificar (RF-24, HU-15).
function AvisoInalterable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <svg
        className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
      <div className="text-sm">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
          Log de auditoría inalterable
        </p>
        <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
          Supervisa cancelaciones de ventas y pedidos y los ajustes manuales de
          existencias. Cada registro guarda quién lo hizo, quién lo autorizó, la
          justificación y el antes/después. No se puede editar ni eliminar.
        </p>
      </div>
    </div>
  );
}

function TablaCargando() {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

function EstadoVacio({
  hayFiltros,
  onLimpiar,
}: {
  hayFiltros: boolean;
  onLimpiar: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {hayFiltros
          ? "Ningún registro coincide con los filtros."
          : "Todavía no hay operaciones registradas en el log."}
      </p>
      {hayFiltros && (
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={onLimpiar}
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
