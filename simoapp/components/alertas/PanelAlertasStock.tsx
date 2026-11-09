"use client";

// EP-05 — Alertas de stock: la lista de reposición del almacén, con la misma
// regla del Banner y de la Campana (lib/inventario/alertasStock.ts:
// "bajo mínimo" = stockActual <= stockMinimo).
//
// Es la única parte del módulo "Alertas y Auditoría" que ve el Encargado de
// Inventario: el log de auditoría y la consola de reportes son del
// Administrador y del Gerente (ver VistaAlertasAuditoria.tsx).

import Link from "next/link";
import { useProductos } from "@/components/catalogo/ProductosContext";
import { Badge } from "@/components/ui/Badge";
import { deficitUnidades, resumirAlertas } from "@/lib/inventario/alertasStock";

const formato = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

export default function PanelAlertasStock() {
  const { productos, origen } = useProductos();
  const resumen = resumirAlertas(productos);

  if (origen === "cargando") {
    return (
      <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
        Cargando inventario...
      </p>
    );
  }

  if (resumen.total === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
      >
        <p className="font-semibold">No hay reposiciones pendientes.</p>
        <p className="mt-1 text-xs">
          Todos los productos activos están por encima de su stock mínimo.
        </p>
      </div>
    );
  }

  // Primero los agotados: son los que ya no se pueden vender.
  const filas = [
    ...resumen.agotados.map((producto) => ({ producto, agotado: true })),
    ...resumen.bajoMinimo.map((producto) => ({ producto, agotado: false })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {formato.format(resumen.total)}
          </span>{" "}
          {resumen.total === 1 ? "producto requiere" : "productos requieren"} reposición ·{" "}
          {resumen.agotados.length > 0 && (
            <span className="font-semibold text-red-600 dark:text-red-400">
              {formato.format(resumen.agotados.length)} agotados ·{" "}
            </span>
          )}
          faltan {formato.format(resumen.unidadesFaltantes)} unidades para cubrir los mínimos.
        </p>
        <Link
          href="/catalogo"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Ir al catálogo
        </Link>
      </div>

      {origen === "respaldo" && (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        >
          No se pudo conectar con el servidor: estas alertas salen de los
          productos de prueba, no del inventario real.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Producto</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Stock actual</th>
              <th className="px-4 py-3 text-right font-semibold">Mínimo</th>
              <th className="px-4 py-3 text-right font-semibold">Faltan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filas.map(({ producto, agotado }) => (
              <tr key={producto.id} className="bg-white dark:bg-zinc-900">
                <td className="px-4 py-3">
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    {producto.nombre}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {producto.codigo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={agotado ? "danger" : "warning"} size="sm" pill>
                    {agotado ? "Agotado" : "Bajo mínimo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formato.format(producto.stockActual)} {producto.unidadMedida}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formato.format(producto.stockMinimo)} {producto.unidadMedida}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {formato.format(deficitUnidades(producto))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
