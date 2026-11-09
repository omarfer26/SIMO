"use client";

// Consola de descargas de reportes — Orquestador (componente de cliente).
//
// Dueña del estado de los filtros y de la lista, igual que VistaKardex:
//  - Pide los reportes con listarReportes() (mock mientras no haya backend).
//  - Filtra por rango de fechas con la utilidad compartida fechaEnRango (la del
//    Kardex/Pedidos) y por formato/categoría/búsqueda con filtrarReportes
//    (función pura de lib/reportes). Los filtros se acumulan.
//  - Dibuja la barra de filtros (FiltrosReportes) y la grilla de tarjetas
//    (TarjetaReporte), con sus estados de carga, error y vacío.
//  - Al "Descargar", llama a descargarReporte() y avisa con un Toast del centro
//    de notificaciones.

import { useEffect, useMemo, useState } from "react";
import {
  fechaEnRango,
  hayRango,
  rangoInvalido,
} from "@/components/pedidos/FiltroFechasPedidos";
import { useNotificaciones } from "@/components/notificaciones/NotificacionesContext";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  FILTROS_INICIALES,
  NOMBRES_FORMATO,
  filtrarReportes,
  hayFiltrosActivos,
  type FiltrosReportes,
  type Reporte,
} from "@/lib/reportes/tipos";
import {
  descargarReporte,
  listarReportes,
  mensajeErrorReportes,
} from "@/lib/reportes/reportesService";
import FiltrosReportesUI from "./FiltrosReportes";
import TarjetaReporte from "./TarjetaReporte";

// La lista puede estar en uno de tres momentos, y solo en uno a la vez.
type EstadoLista =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; reportes: Reporte[] };

// Cuadros grises con la forma de la grilla de tarjetas, mientras llega la lista.
function GrillaCargando() {
  return (
    <div
      role="status"
      aria-label="Cargando reportes"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
          <Skeleton className="mt-4 h-5 w-32 rounded-full" />
          <Skeleton className="mt-4 h-16 w-full" />
          <Skeleton className="mt-4 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function ConsolaDescargasReportes() {
  const { notificar } = useNotificaciones();
  const [lista, setLista] = useState<EstadoLista>({ tipo: "cargando" });
  // Cada vez que este número cambia, se vuelve a pedir la lista ("Reintentar").
  const [recarga, setRecarga] = useState(0);
  const [filtros, setFiltros] = useState<FiltrosReportes>(FILTROS_INICIALES);
  // Id del reporte que se está bajando, para mostrar el Spinner solo en ese.
  const [idDescargando, setIdDescargando] = useState<number | null>(null);

  useEffect(() => {
    // Si la página se cierra (o se pide otra recarga) antes de que llegue la
    // respuesta, `vigente` evita pintar un resultado viejo.
    let vigente = true;
    listarReportes()
      .then((reportes) => {
        if (vigente) setLista({ tipo: "lista", reportes });
      })
      .catch((error) => {
        if (vigente) setLista({ tipo: "error", mensaje: mensajeErrorReportes(error) });
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  // Se memoiza para que `reportes` sea una referencia estable entre renders:
  // si no, el [] de los estados "cargando"/"error" cambiaría en cada render y
  // haría recalcular los useMemo que dependen de él (aviso de exhaustive-deps).
  const reportes = useMemo(
    () => (lista.tipo === "lista" ? lista.reportes : []),
    [lista],
  );

  // Primero el rango de fechas (utilidad compartida); si está al revés o vacío,
  // no se filtra por fecha. `mostradosPorFecha` alimenta el mensaje del filtro.
  const porFecha = useMemo(() => {
    if (!hayRango(filtros.rango) || rangoInvalido(filtros.rango)) return reportes;
    return reportes.filter((reporte) =>
      fechaEnRango(reporte.fechaGeneracion, filtros.rango),
    );
  }, [reportes, filtros.rango]);

  // Luego formato, categoría y texto (función pura de lib/reportes).
  const visibles = useMemo(() => filtrarReportes(porFecha, filtros), [porFecha, filtros]);

  async function manejarDescarga(reporte: Reporte) {
    setIdDescargando(reporte.id);
    try {
      await descargarReporte(reporte);
      notificar({
        variante: "exito",
        titulo: "Descarga lista",
        origen: "sistema",
        detalle: `${reporte.nombre} · ${NOMBRES_FORMATO[reporte.formato]}`,
      });
    } catch (error) {
      notificar({
        variante: "critico",
        titulo: "No se pudo descargar",
        origen: "sistema",
        detalle: mensajeErrorReportes(error),
      });
    } finally {
      setIdDescargando(null);
    }
  }

  return (
    <div className="space-y-6">
      {lista.tipo === "cargando" && <GrillaCargando />}

      {lista.tipo === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>{lista.mensaje}</span>
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
        <>
          <FiltrosReportesUI
            filtros={filtros}
            onCambiar={setFiltros}
            total={reportes.length}
            mostradosPorFecha={porFecha.length}
          />

          <div className="flex items-baseline justify-between gap-3">
            {/* aria-live: un lector de pantalla anuncia el resultado al filtrar. */}
            <h2
              aria-live="polite"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {visibles.length}{" "}
              {visibles.length === 1 ? "reporte disponible" : "reportes disponibles"}
            </h2>
          </div>

          {visibles.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibles.map((reporte) => (
                <TarjetaReporte
                  key={reporte.id}
                  reporte={reporte}
                  descargando={idDescargando === reporte.id}
                  onDescargar={manejarDescarga}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-4 py-14 text-center dark:border-zinc-700">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {hayFiltrosActivos(filtros)
                  ? "Ningún reporte coincide con los filtros elegidos."
                  : "Todavía no hay reportes generados."}
              </p>
              {hayFiltrosActivos(filtros) && (
                <Button variant="secondary" onClick={() => setFiltros(FILTROS_INICIALES)}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
