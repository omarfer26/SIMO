"use client"; // Los "error boundaries" de Next.js tienen que ser de cliente.

// SCRUM-154 (Camilo) — Página 500 dentro del Shell. Si una página del
// sistema se cae mientras se pinta (un dato inesperado, un error de
// programación), Next.js cambia SOLO el contenido de la página por esto: el
// Navbar y el Sidebar siguen visibles, porque error.tsx no envuelve el
// layout de su misma carpeta (app/(protected)/layout.tsx, donde vive el
// Shell). Si el que falla es el Shell, lo atrapa app/error.tsx.
//
// "retry" (de Next.js) vuelve a intentar pintar la página. El mensaje real
// del error no se muestra: puede ser técnico o traer datos internos. Va a la
// consola y, si existe, se muestra el "digest" (código corto que sirve para
// buscarlo en los registros del servidor).

import { useEffect } from "react";
import PantallaError from "@/components/errores/PantallaError";

export default function ErrorDelSistema({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[SIMO] Error al mostrar la página:", error);
  }, [error]);

  return (
    <PantallaError
      codigo="500"
      titulo="Algo salió mal"
      mensaje="Tuvimos un problema al cargar esta sección. Tus datos guardados no se perdieron. Intenta de nuevo; si el problema sigue, avisa al administrador."
      onReintentar={retry}
      referencia={error.digest}
    />
  );
}
