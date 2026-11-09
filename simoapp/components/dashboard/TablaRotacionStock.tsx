"use client";

// Dashboard Operacional — Detalle de rotación por producto. El gráfico
// muestra el top; acá están todos los productos del catálogo con las
// unidades vendidas, el stock que queda y para cuántos días alcanza.

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import { formatearIndice, formatoNumero } from "@/lib/dashboard/formato";
import type { RotacionProducto } from "@/lib/dashboard/tipos";
import { ETIQUETA_ROTACION, VARIANTE_ROTACION } from "./rotacion";

interface TablaRotacionStockProps {
  datos: RotacionProducto[];
  pageSize?: number;
}

export default function TablaRotacionStock({ datos, pageSize = 8 }: TablaRotacionStockProps) {
  const columnas = useMemo<ColumnaTabla<RotacionProducto>[]>(
    () => [
      {
        key: "producto",
        header: "Producto",
        accessor: (fila) => fila.nombre,
        sortable: true,
        render: (fila) => (
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{fila.nombre}</p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {fila.codigo} · {fila.categoria}
            </p>
          </div>
        ),
      },
      {
        key: "unidades",
        header: "Vendidas",
        accessor: (fila) => fila.unidadesVendidas,
        sortable: true,
        align: "right",
        render: (fila) => formatoNumero.format(fila.unidadesVendidas),
      },
      {
        key: "stock",
        header: "Stock",
        accessor: (fila) => fila.stockActual,
        sortable: true,
        align: "right",
        render: (fila) => (
          <span
            className={
              fila.requiereReposicion
                ? "font-semibold text-amber-600 dark:text-amber-400"
                : undefined
            }
            title={fila.requiereReposicion ? "En o por debajo del stock mínimo" : undefined}
          >
            {formatoNumero.format(fila.stockActual)}
            {fila.requiereReposicion && <span aria-hidden="true"> ⚠</span>}
          </span>
        ),
      },
      {
        key: "rotacion",
        header: "Rotación",
        accessor: (fila) => fila.indiceRotacion,
        sortable: true,
        align: "right",
        render: (fila) => (
          <span className="font-mono text-xs">{formatearIndice(fila.indiceRotacion)}</span>
        ),
      },
      {
        key: "cobertura",
        header: "Cobertura",
        accessor: (fila) => fila.coberturaDias ?? -1,
        sortable: true,
        align: "right",
        render: (fila) =>
          fila.coberturaDias === null ? (
            <span className="text-zinc-400 dark:text-zinc-500">—</span>
          ) : (
            `${Math.round(fila.coberturaDias)} días`
          ),
      },
      {
        key: "clasificacion",
        header: "Clasificación",
        accessor: (fila) => ETIQUETA_ROTACION[fila.clasificacion],
        sortable: true,
        render: (fila) => (
          <Badge variant={VARIANTE_ROTACION[fila.clasificacion]} size="sm" pill>
            {ETIQUETA_ROTACION[fila.clasificacion]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columnas}
      data={datos}
      getRowKey={(fila) => fila.idProducto}
      pageSize={pageSize}
      pageSizeOptions={[8, 12, 25]}
      initialSort={{ key: "rotacion", direction: "desc" }}
      caption="Rotación de stock por producto"
      emptyMessage="No hay productos en el catálogo para calcular la rotación."
    />
  );
}
