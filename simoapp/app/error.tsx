"use client";

// SCRUM-154 (Camilo) — Respaldo del 500 para cuando lo que falla es el propio
// Shell (Navbar, Sidebar o los providers de app/(protected)/layout.tsx) o
// la pantalla de login. En ese caso no hay barra de navegación que mostrar,
// así que se pinta la misma PantallaError sola, centrada en la página.

import { useEffect } from "react";
import PantallaError from "@/components/errores/PantallaError";

export default function ErrorGeneral({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[SIMO] Error general de la aplicación:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <PantallaError
        codigo="500"
        titulo="Algo salió mal"
        mensaje="El sistema tuvo un problema al cargar. Intenta de nuevo en unos segundos; si el problema sigue, avisa al administrador."
        onReintentar={retry}
        referencia={error.digest}
      />
    </div>
  );
}
