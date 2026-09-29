"use client";

// SCRUM-107 (Camilo) — Sidebar lateral del Shell, con navegación entre
// módulos. Dos comportamientos distintos según el tamaño de pantalla:
//  - Escritorio (md hacia arriba): siempre visible, se puede "colapsar" a
//    solo íconos con el botón de la flecha (más espacio para el contenido).
//  - Celular/tablet chico: oculto por defecto, aparece como un cajón (drawer)
//    encima del contenido cuando se abre desde el botón de hamburguesa del
//    Navbar, con un fondo oscuro detrás para cerrarlo tocando afuera.
// El módulo activo se resalta comparando la ruta actual (usePathname) contra
// el href de cada ítem.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { modulos } from "./modulos";

interface SidebarProps {
  abiertoEnMobile: boolean;
  colapsado: boolean;
  onCerrarEnMobile: () => void;
  onAlternarColapsado: () => void;
}

export default function Sidebar({
  abiertoEnMobile,
  colapsado,
  onCerrarEnMobile,
  onAlternarColapsado,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {abiertoEnMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onCerrarEnMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-200 bg-white pt-14 transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:pt-0 ${
          abiertoEnMobile ? "translate-x-0" : "-translate-x-full"
        } ${colapsado ? "md:w-16" : "md:w-60"}`}
      >
        <button
          type="button"
          onClick={onAlternarColapsado}
          aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
          className="hidden shrink-0 items-center justify-center border-b border-zinc-200 py-2 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 md:flex"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 transition-transform ${colapsado ? "rotate-180" : ""}`}
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {modulos.map((modulo) => {
            const activo =
              modulo.href === "/"
                ? pathname === "/"
                : pathname === modulo.href || pathname.startsWith(`${modulo.href}/`);

            return (
              <Link
                key={modulo.href}
                href={modulo.href}
                onClick={onCerrarEnMobile}
                title={colapsado ? modulo.nombre : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  colapsado ? "md:justify-center" : ""
                } ${
                  activo
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {modulo.icono}
                <span className={colapsado ? "md:hidden" : ""}>
                  {modulo.nombre}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
