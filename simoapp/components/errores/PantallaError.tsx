"use client";

// SCRUM-154 (Camilo) — Pantalla amigable para los errores 404 (la dirección
// no existe) y 500 (algo falló en el sistema). Es solo la parte visual: la
// usan app/(protected)/not-found.tsx y app/(protected)/error.tsx, que viven
// DENTRO del Shell, así que el Navbar y el Sidebar siguen visibles y el
// usuario puede seguir navegando sin perderse.
//
// Botones:
//  - "Ir al inicio": lleva al inicio de su rol (inicioDe en
//    lib/auth/permisos.ts). No siempre es "/": el Vendedor y el Encargado de
//    Inventario no tienen Dashboard, y el middleware los rebotaría.
//  - "Volver atrás": la página anterior del historial del navegador.
//  - "Reintentar" (solo en el 500): vuelve a pintar la parte que falló.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { inicioDe } from "@/lib/auth/permisos";
import { useRolSesion } from "@/lib/auth/useRolSesion";

type CodigoError = "404" | "500";

interface Props {
  codigo: CodigoError;
  titulo: string;
  mensaje: string;
  /** Solo en el 500: vuelve a intentar pintar la sección que falló. */
  onReintentar?: () => void;
  /** Código corto para que soporte encuentre el error en los registros. */
  referencia?: string;
}

// Colores por tipo de error: el 404 es un aviso tranquilo (gris/verde de la
// marca) y el 500 un problema del sistema (rojo suave).
const estilos: Record<CodigoError, { numero: string; icono: string }> = {
  "404": {
    numero: "text-zinc-300 dark:text-zinc-700",
    icono: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  },
  "500": {
    numero: "text-red-200 dark:text-red-900",
    icono: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  },
};

// Íconos dibujados con SVG, igual que los del Sidebar (sin librería).
function IconoNoEncontrado() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      <path d="M9 9l4 4M13 9l-4 4" strokeLinecap="round" />
    </svg>
  );
}

function IconoFalla() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7" aria-hidden="true">
      <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" />
      <path d="M12 9v4.5" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

export default function PantallaError({ codigo, titulo, mensaje, onReintentar, referencia }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const rol = useRolSesion();
  // Mientras el rol no se lee (justo al cargar) inicioDe(null) daría
  // "/login"; en ese instante se apunta a "/" y el middleware hace el resto.
  const destinoInicio = rol ? inicioDe(rol) : "/";
  const estilo = estilos[codigo];

  return (
    <section
      aria-labelledby="titulo-error"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-16 text-center sm:px-8 sm:py-24"
    >
      {/* Ícono arriba y el código grande debajo, sin encimarse. */}
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${estilo.icono}`}>
        {codigo === "404" ? <IconoNoEncontrado /> : <IconoFalla />}
      </span>
      <p className={`mt-4 select-none text-7xl font-bold leading-none tracking-tight sm:text-8xl ${estilo.numero}`}>
        <span className="sr-only">Error </span>
        {codigo}
      </p>

      <h1 id="titulo-error" className="mt-6 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
        {titulo}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{mensaje}</p>

      {/* En el 404 se muestra la dirección que se pidió, para que el usuario
          vea si escribió algo mal. */}
      {codigo === "404" && ruta && (
        <code className="mt-4 max-w-full break-all rounded-md bg-zinc-100 px-2.5 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {ruta}
        </code>
      )}

      <div className="mt-8 flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:justify-center">
        <Button variant="secondary" onClick={() => router.back()} className="w-full sm:w-auto">
          ← Volver atrás
        </Button>
        {onReintentar && (
          <Button variant="secondary" onClick={onReintentar} className="w-full sm:w-auto">
            Reintentar
          </Button>
        )}
        <Link
          href={destinoInicio}
          className="inline-flex w-full items-center justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:w-auto dark:focus-visible:ring-offset-zinc-900"
        >
          Ir al inicio
        </Link>
      </div>

      {referencia && (
        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
          Si el problema sigue, comparte este código con el administrador:{" "}
          <code className="font-mono text-zinc-700 dark:text-zinc-300">{referencia}</code>
        </p>
      )}
    </section>
  );
}
