// SCRUM-39 (Camilo) — Página en la ruta /kardex: el historial de movimientos
// (Kardex) de un producto. Solo pone el título; todo lo demás vive en
// VistaKardex. Va dentro de <Suspense> porque VistaKardex lee el producto de
// la dirección (?producto=3) con useSearchParams, y esta versión de Next.js
// lo pide así para poder armar el resto de la página antes (ver
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).
import { Suspense } from "react";
import Link from "next/link";
import VistaKardex from "@/components/inventario/VistaKardex";
import { Skeleton } from "@/components/ui/Skeleton";

export default function KardexPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">
      <Link
        href="/catalogo"
        className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
      >
        ← Volver al catálogo
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Kardex</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Todos los movimientos de un producto en orden cronológico, con el saldo de Bodega y
        Almacén después de cada uno y su valor por costo promedio.
      </p>

      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-16 w-full max-w-md" />}>
          <VistaKardex />
        </Suspense>
      </div>
    </main>
  );
}
