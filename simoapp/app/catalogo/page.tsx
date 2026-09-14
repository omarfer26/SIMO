// SCRUM-31 (Camilo) — Página nueva en la ruta /catalogo. Solo pone el título
// y monta el componente de búsqueda; toda la lógica vive en BusquedaCatalogo.
import BusquedaCatalogo from "@/components/catalogo/BusquedaCatalogo";

export default function CatalogoPage() {
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
        <BusquedaCatalogo />
      </div>
    </main>
  );
}
