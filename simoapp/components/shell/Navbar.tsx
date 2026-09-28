"use client";

// SCRUM-107 (Camilo) — Navbar superior del Shell: logo + nombre de la
// empresa, botón de hamburguesa (solo en pantallas chicas, abre el Sidebar
// como cajón encima del contenido) y menú de usuario desplegable (nombre,
// rol, "Mi perfil" y "Cerrar sesión" — sin lógica real todavía, ver
// limitación documentada en camilo-sanchez.md).

import { useState } from "react";
import Link from "next/link";
import { empresaMock, usuarioMock } from "./datos.mock";

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase())
    .join("");
}

interface NavbarProps {
  onAbrirSidebarMobile: () => void;
}

export default function Navbar({ onAbrirSidebarMobile }: NavbarProps) {
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
      <button
        type="button"
        onClick={onAbrirSidebarMobile}
        aria-label="Abrir menú de navegación"
        className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      </button>

      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">
          {empresaMock.razonSocial.charAt(0)}
        </span>
        <span className="hidden text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:inline">
          {empresaMock.razonSocial}
        </span>
      </Link>

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenuUsuarioAbierto((abierto) => !abierto)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {iniciales(usuarioMock.nombre)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {usuarioMock.nombre}
            </span>
            <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
              {usuarioMock.rol}
            </span>
          </span>
        </button>

        {menuUsuarioAbierto && (
          <>
            {/* Botón invisible detrás del menú: cerrarlo al hacer clic afuera */}
            <button
              type="button"
              aria-label="Cerrar menú de usuario"
              onClick={() => setMenuUsuarioAbierto(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => setMenuUsuarioAbierto(false)}
              >
                Mi perfil
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setMenuUsuarioAbierto(false)}
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
