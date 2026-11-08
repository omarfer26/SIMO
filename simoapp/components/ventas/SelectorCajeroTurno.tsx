"use client";

// Componente para seleccionar y cambiar el cajero / vendedor en turno en el POS.
// Permite asociar cada transacción de venta al cajero específico que está operando
// en la caja registradora durante el turno actual.

import { useState } from "react";
import type { UsuarioListado } from "@/lib/auth/tipos";

interface SelectorCajeroTurnoProps {
  cajeroActual: UsuarioListado | null;
  cajerosDisponibles: UsuarioListado[];
  cargando?: boolean;
  onCambiarCajero: (cajero: UsuarioListado) => void;
}

export default function SelectorCajeroTurno({
  cajeroActual,
  cajerosDisponibles,
  cargando = false,
  onCambiarCajero,
}: SelectorCajeroTurnoProps) {
  const [abierto, setAbierto] = useState(false);

  // Iniciales para avatar
  const iniciales = (nombre: string) =>
    nombre
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

  return (
    <div className="relative">
      <div className="flex flex-col gap-1">
        <label
          id="label-cajero-turno"
          className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center justify-between"
        >
          <span className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            Cajero en Turno
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Turno Activo
          </span>
        </label>

        {/* Botón selector principal */}
        <button
          type="button"
          aria-labelledby="label-cajero-turno"
          aria-haspopup="listbox"
          aria-expanded={abierto}
          onClick={() => setAbierto((prev) => !prev)}
          disabled={cargando || cajerosDisponibles.length === 0}
          className="group flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-2.5 text-left shadow-sm transition hover:border-emerald-500 hover:bg-zinc-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-600 dark:hover:bg-zinc-800/60"
        >
          {cajeroActual ? (
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {iniciales(cajeroActual.nombreCompleto)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {cajeroActual.nombreCompleto}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>@{cajeroActual.usuario}</span>
                  <span>•</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {cajeroActual.rol}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>{cargando ? "Cargando cajeros..." : "Seleccionar cajero"}</span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200">
            <span className="text-xs hidden sm:inline text-zinc-400 font-normal">Cambiar</span>
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Desplegable de selección con backdrop sutil */}
      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar selector de cajero"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 mb-1">
              Personal autorizado en turno
            </div>

            {cajerosDisponibles.length === 0 ? (
              <p className="p-3 text-center text-xs text-zinc-500">
                No hay usuarios activos con rol de caja o vendedor.
              </p>
            ) : (
              cajerosDisponibles.map((usuario) => {
                const seleccionado = cajeroActual?.id === usuario.id;

                return (
                  <button
                    key={usuario.id}
                    type="button"
                    role="option"
                    aria-selected={seleccionado}
                    onClick={() => {
                      onCambiarCajero(usuario);
                      setAbierto(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      seleccionado
                        ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-medium"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          seleccionado
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {iniciales(usuario.nombreCompleto)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold leading-tight">
                          {usuario.nombreCompleto}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          @{usuario.usuario} • {usuario.rol}
                        </p>
                      </div>
                    </div>

                    {seleccionado && (
                      <svg
                        className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
