"use client";

// Centro de notificaciones — Toast (presentación pura).
//
// Recibe una `Notificacion` ya armada en lib/ y solo la pinta: no decide
// severidad, ni texto, ni cuándo se cierra (eso vive en lib/notificaciones).
// El estilo sigue las reglas del proyecto: mapa `Record<Variante, string>` de
// clases Tailwind (como Button.tsx), superficies tintadas con su variante
// `dark:` (como BannerConexion.tsx) y ningún `style` en línea.

import Link from "next/link";
import {
  ETIQUETA_ORIGEN,
  type Notificacion,
  type VarianteNotificacion,
} from "@/lib/notificaciones/tipos";

// Fondo, borde y texto del aviso.
const clasesPorVariante: Record<VarianteNotificacion, string> = {
  critico:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  aviso:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  exito:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

// Barra de acento a la izquierda + círculo del ícono.
const acentoPorVariante: Record<VarianteNotificacion, string> = {
  critico: "bg-red-600",
  aviso: "bg-amber-500",
  exito: "bg-emerald-600",
  info: "bg-sky-600",
};

// Íconos de trazo (heroicons outline), 24x24, como los del resto del Shell.
const ICONO_CRITICO =
  "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z";
const ICONO_AVISO =
  "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z";
const ICONO_EXITO =
  "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";
const ICONO_INFO =
  "M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.852l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z";

const iconoPorVariante: Record<VarianteNotificacion, string> = {
  critico: ICONO_CRITICO,
  aviso: ICONO_AVISO,
  exito: ICONO_EXITO,
  info: ICONO_INFO,
};

export interface ToastProps {
  notificacion: Notificacion;
  onCerrar: (id: string) => void;
}

export default function Toast({ notificacion, onCerrar }: ToastProps) {
  const { id, variante, titulo, detalle, origen, veces, accion } = notificacion;

  // Crítico y aviso van como "alert" (se anuncian de inmediato al lector de
  // pantalla); éxito e info como "status", que es más tranquilo.
  const esGrave = variante === "critico" || variante === "aviso";

  return (
    <div
      role={esGrave ? "alert" : "status"}
      className={`animate-notificacion-entrada relative flex gap-3 overflow-hidden rounded-lg border p-3 pr-9 shadow-lg ring-1 ring-black/5 dark:ring-white/10 ${clasesPorVariante[variante]}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${acentoPorVariante[variante]}`}
      />

      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${acentoPorVariante[variante]}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d={iconoPorVariante[variante]} />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold leading-snug">{titulo}</p>
          {veces > 1 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white ${acentoPorVariante[variante]}`}
              title={`Se reportó ${veces} veces y se agruparon los avisos en uno`}
            >
              ×{veces}
            </span>
          )}
        </div>

        {detalle && (
          <p className="mt-1 text-xs leading-relaxed opacity-90">{detalle}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">
            {ETIQUETA_ORIGEN[origen]}
          </span>
          {accion && (
            <Link
              href={accion.href}
              className="text-xs font-semibold underline underline-offset-2 opacity-90 hover:opacity-100"
            >
              {accion.etiqueta}
            </Link>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCerrar(id)}
        aria-label={`Cerrar aviso: ${titulo}`}
        className="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
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
    </div>
  );
}
