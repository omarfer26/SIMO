"use client";

// (Camilo, 2026-11-10) — Aviso que se muestra cuando el catálogo no se pudo
// traer del backend (`origen === "error"` en ProductosContext). Antes, en ese
// caso, se mostraban productos de prueba con un aviso amarillo; ahora la lista
// queda vacía y este aviso deja reintentar sin recargar la página.
// Lo usan el catálogo, el Dashboard, las alertas de stock y el formulario
// de pedidos.

import { useState } from "react";
import Button from "@/components/ui/Button";
import { useProductos } from "./ProductosContext";

interface Props {
  /** Qué parte de la pantalla queda sin datos, p. ej. "las alertas de stock". */
  queFalta?: string;
  className?: string;
}

export default function AvisoCatalogoSinConexion({ queFalta, className = "" }: Props) {
  const { origen, refrescarProductos } = useProductos();
  const [reintentando, setReintentando] = useState(false);

  if (origen !== "error") return null;

  async function reintentar() {
    setReintentando(true);
    await refrescarProductos();
    setReintentando(false);
  }

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 ${className}`}
    >
      <span>
        No se pudo conectar con el servidor para traer el inventario
        {queFalta ? `, así que ${queFalta} no se pueden mostrar` : ""}.
      </span>
      <Button variant="secondary" onClick={reintentar} disabled={reintentando}>
        {reintentando ? "Reintentando..." : "Reintentar"}
      </Button>
    </div>
  );
}
