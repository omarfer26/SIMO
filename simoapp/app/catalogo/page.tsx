"use client";

// SCRUM-31 (Camilo) — Página en la ruta /catalogo. Pone el título y monta
// el componente de búsqueda; toda la lógica de filtrado vive en
// BusquedaCatalogo. Pasó a ser Client Component (antes no lo era) para
// poder leer `productos` del ProductosContext compartido en vez de usar
// siempre el mock fijo — así los productos que se crean en
// /formuProductos aparecen acá también, sin recargar la página.
import BusquedaCatalogo from "@/components/catalogo/BusquedaCatalogo";
import { useProductos } from "@/components/catalogo/ProductosContext";

export default function CatalogoPage() {
  const { productos } = useProductos();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Catálogo de productos
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Busca por código o nombre, y combina los filtros de categoría,
        disponibilidad y estado.
      </p>

      <div className="mt-6">
        <BusquedaCatalogo productos={productos} />
      </div>
    </main>
  );
}
