"use client";

// SCRUM-159 (Camilo) — Segundo paso de las acciones que no se pueden deshacer
// (anular una venta, cancelar un pedido). Va DENTRO del modal donde se
// llenaron los datos, en lugar del formulario: muestra el aviso rojo, el
// resumen de lo que va a pasar (lo arma quien lo usa, por `children`) y dos
// botones. "Volver" regresa a los datos sin perder nada; solo el botón rojo
// ejecuta la acción.
//
// El foco arranca en "Volver": si alguien presiona Enter sin leer, no se
// anula nada por accidente.

import { useId, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

interface ConfirmacionDestructivaProps {
  /** Pregunta corta, por ejemplo "¿Anular la venta #12?". */
  titulo: string;
  /** Resumen de lo que va a pasar (qué se devuelve al inventario, motivo…). */
  children: ReactNode;
  /** Texto del botón rojo, por ejemplo "Sí, anular venta". */
  textoConfirmar: string;
  /** Texto mientras se espera al servidor, por ejemplo "Anulando…". */
  textoProcesando: string;
  procesando: boolean;
  /** Error del servidor, si lo hubo (se muestra sin salir de este paso). */
  error?: string | null;
  onConfirmar: () => void;
  onVolver: () => void;
}

export default function ConfirmacionDestructiva({
  titulo,
  children,
  textoConfirmar,
  textoProcesando,
  procesando,
  error,
  onConfirmar,
  onVolver,
}: ConfirmacionDestructivaProps) {
  const idTitulo = useId();

  return (
    <section aria-labelledby={idTitulo} className="space-y-4">
      {/* Aviso rojo: lo primero que se lee */}
      <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p id={idTitulo} className="font-semibold">
            {titulo}
          </p>
          <p className="text-sm">Esta acción no se puede deshacer.</p>
        </div>
      </div>

      {/* Resumen de lo que va a pasar */}
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300">
        {children}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onVolver}
          disabled={procesando}
          autoFocus
        >
          Volver
        </Button>
        <Button type="button" variant="danger" onClick={onConfirmar} disabled={procesando}>
          {procesando ? (
            <>
              <Spinner size="sm" color="white" />
              <span>{textoProcesando}</span>
            </>
          ) : (
            textoConfirmar
          )}
        </Button>
      </div>
    </section>
  );
}
