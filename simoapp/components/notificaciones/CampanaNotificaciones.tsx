"use client";

// Centro de notificaciones — Campana del Navbar (panel de avisos).
//
// El Toast interrumpe y se va; la Campana es el historial de lo que quedó en la
// pila, para volver a leerlo después. El punto rojo cuenta los avisos que nadie
// ha visto; abrir el panel los marca como leídos.
//
// El desplegable sigue el mismo molde del menú de usuario de Navbar.tsx: un
// botón invisible a pantalla completa cierra el panel al hacer clic afuera, y
// Escape lo cierra desde el teclado.

import { useEffect, useState } from "react";
import Link from "next/link";
import { tiempoRelativo } from "@/lib/notificaciones/formato";
import {
  ETIQUETA_ORIGEN,
  ORDEN_VARIANTE,
  type VarianteNotificacion,
} from "@/lib/notificaciones/tipos";
import { useNotificaciones } from "./NotificacionesContext";

const PUNTO_POR_VARIANTE: Record<VarianteNotificacion, string> = {
  critico: "bg-red-600",
  aviso: "bg-amber-500",
  exito: "bg-emerald-600",
  info: "bg-sky-600",
};

const ICONO_CAMPANA =
  "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0";

export default function CampanaNotificaciones() {
  const { cola, noLeidas, cerrar, marcarTodoLeido, vaciar } = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  // Hora de referencia para los "hace 3 min" de la lista.
  const [ahora, setAhora] = useState(() => Date.now());

  // Abrir = ya se vieron.
  useEffect(() => {
    if (abierto) marcarTodoLeido();
  }, [abierto, marcarTodoLeido]);

  // Mientras el panel está abierto, los tiempos relativos se refrescan solos.
  useEffect(() => {
    if (!abierto) return;
    const temporizador = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(temporizador);
  }, [abierto]);

  // La hora de referencia se actualiza en el manejador del clic, no en el cuerpo
  // del effect de arriba: ahí sería un setState síncrono que obligaría a React a
  // tirar otro render apenas se abre el panel (react-hooks/set-state-in-effect).
  const alternarPanel = () => {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente) setAhora(Date.now());
  };

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  const pendientes = [...cola].sort(
    (a, b) => ORDEN_VARIANTE[a.variante] - ORDEN_VARIANTE[b.variante] || b.creada - a.creada,
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={alternarPanel}
        aria-label={
          noLeidas > 0
            ? `Notificaciones, ${noLeidas} sin leer`
            : "Notificaciones, todo leído"
        }
        aria-expanded={abierto}
        className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d={ICONO_CAMPANA} />
          </svg>
          {noLeidas > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
              {noLeidas > 9 ? "9+" : noLeidas}
            </span>
          )}
        </span>
      </button>

      {abierto && (
        <>
          {/* Botón invisible detrás del panel: cerrarlo al hacer clic afuera */}
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Notificaciones
                {cola.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    {cola.length}
                  </span>
                )}
              </p>
              {cola.length > 0 && (
                <button
                  type="button"
                  onClick={vaciar}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Vaciar
                </button>
              )}
            </div>

            {pendientes.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Sin avisos pendientes
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  El sistema avisa solo cuando un producto cruza su stock mínimo o se agota.
                </p>
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {pendientes.map((notificacion) => (
                  <li
                    key={notificacion.id}
                    className="flex gap-2.5 border-b border-zinc-100 px-3 py-2.5 last:border-b-0 dark:border-zinc-800/60"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO_POR_VARIANTE[notificacion.variante]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                        {notificacion.titulo}
                        {notificacion.veces > 1 && (
                          <span className="ml-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            ×{notificacion.veces}
                          </span>
                        )}
                      </p>
                      {notificacion.detalle && (
                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {notificacion.detalle}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {ETIQUETA_ORIGEN[notificacion.origen]} ·{" "}
                        {tiempoRelativo(notificacion.creada, ahora)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => cerrar(notificacion.id)}
                      aria-label={`Quitar aviso: ${notificacion.titulo}`}
                      className="h-6 shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40">
              <Link
                href="/"
                onClick={() => setAbierto(false)}
                className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Ver reposición en el tablero
              </Link>
              <Link
                href="/catalogo"
                onClick={() => setAbierto(false)}
                className="text-xs font-semibold text-zinc-600 hover:underline dark:text-zinc-300"
              >
                Catálogo
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
