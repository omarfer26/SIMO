"use client";

// SCRUM-31 (Camilo) — Página en la ruta /catalogo. Pone el título y monta
// el componente de búsqueda; toda la lógica de filtrado vive en
// BusquedaCatalogo. Pasó a ser Client Component (antes no lo era) para
// poder leer `productos` del ProductosContext compartido en vez de usar
// siempre el mock fijo — así los productos que se crean en
// /formuProductos aparecen acá también, sin recargar la página.
import Link from "next/link";
import BusquedaCatalogo from "@/components/catalogo/BusquedaCatalogo";
import { useProductos } from "@/components/catalogo/ProductosContext";

export default function CatalogoPage() {
  const { productos, origen } = useProductos();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Catálogo de productos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Busca por código o nombre, y combina los filtros de categoría,
            disponibilidad y estado.
          </p>
        </div>
        {/* Antes no había ningún link a /formuProductos en toda la app: solo
            se podía entrar escribiendo la URL a mano. */}
        <Link
          href="/formuProductos"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Nuevo producto
        </Link>
      </div>

      {/* SCRUM-catalogoBD (Camilo) — El catálogo viene del backend. Mientras
          llega se avisa que está cargando, y si el backend no responde se
          muestran datos de prueba con este aviso, para que nadie los
          confunda con el inventario real. */}
      {origen === "respaldo" && (
        <p
          role="status"
          className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        >
          No se pudo conectar con el servidor: se muestran productos de
          prueba, no el inventario real.
        </p>
      )}

      <div className="mt-6">
        {origen === "cargando" ? (
          <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
            Cargando catálogo...
          </p>
        ) : (
          <BusquedaCatalogo productos={productos} />
        )}
      </div>
    </main>
  );
}
