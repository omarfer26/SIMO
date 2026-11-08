"use client";

// SCRUM-39 (Camilo) — Tabla cronológica del Kardex de un producto. Usa la
// DataTable de SCRUM-110 (ordenar y paginar) y solo define las columnas:
//  - Fecha y Movimiento (tipo en una etiqueta de color, y debajo la venta,
//    factura o motivo que lo causó).
//  - Bodega y Almacén: lo que entró (+, verde) o salió (−, rojo) de cada una.
//  - Saldos de Bodega, Almacén y Total DESPUÉS del movimiento.
//  - Costo unitario, costo promedio ponderado y saldo valorizado.
//  - Usuario que registró el movimiento.
// Arranca de la más antigua a la más reciente, como se lee un Kardex
// (el saldo va bajando fila por fila); clic en "Fecha" invierte el orden.

import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import type { MovimientoKardex, TipoMovimiento } from "@/lib/inventario/tipos";

const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
// Los costos promedio pueden tener centavos ($ 59.801,60); los demás no.
// Con decimales se muestran siempre los dos, para que no quede "$ 59.801,6".
const monedaEntera = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const monedaConCentavos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2 });
const formatoMoneda = {
  format: (valor: number) => (Number.isInteger(valor) ? monedaEntera : monedaConCentavos).format(valor),
};
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: "Compra",
  TRASLADO_INTERNO: "Traslado",
  SALIDA_VENTA: "Venta",
  SALIDA_PEDIDO: "Pedido",
  REVERSO_VENTA: "Anulación de venta",
  REVERSO_PEDIDO: "Cancelación de pedido",
  AJUSTE_POSITIVO: "Ajuste +",
  AJUSTE_NEGATIVO: "Ajuste −",
};

const COLOR_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  TRASLADO_INTERNO: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SALIDA_VENTA: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  SALIDA_PEDIDO: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  REVERSO_VENTA: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  REVERSO_PEDIDO: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  AJUSTE_POSITIVO: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  AJUSTE_NEGATIVO: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

// Lo que causó el movimiento: la factura de compra, la venta o el pedido.
function referencia(m: MovimientoKardex) {
  if (m.documentoReferencia) return m.documentoReferencia;
  if (m.idVenta) return `Venta #${m.idVenta}`;
  if (m.idPedido) return `Pedido #${m.idPedido}`;
  return null;
}

// "+7" en verde, "−5" en rojo o una raya si el movimiento no tocó esa ubicación.
function CambioUbicacion({ entrada, salida }: { entrada: number; salida: number }) {
  if (entrada > 0) {
    return <span className="text-emerald-600 dark:text-emerald-400">+{formatoCantidad.format(entrada)}</span>;
  }
  if (salida > 0) {
    return <span className="text-red-600 dark:text-red-400">−{formatoCantidad.format(salida)}</span>;
  }
  return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
}

const columnas: ColumnaTabla<MovimientoKardex>[] = [
  {
    key: "fecha",
    header: "Fecha",
    accessor: (m) => m.fecha,
    render: (m) => <span className="whitespace-nowrap">{formatoFechaHora.format(m.fecha)}</span>,
    sortable: true,
  },
  {
    key: "movimiento",
    header: "Movimiento",
    accessor: (m) => NOMBRE_MOVIMIENTO[m.tipo],
    render: (m) => {
      const ref = referencia(m);
      return (
        <div className="min-w-48 max-w-72">
          <span
            className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_MOVIMIENTO[m.tipo]}`}
          >
            {NOMBRE_MOVIMIENTO[m.tipo]}
          </span>
          {(ref || m.motivo) && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {[ref, m.motivo].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      );
    },
    sortable: true,
  },
  {
    key: "bodega",
    header: "Bodega",
    render: (m) => <CambioUbicacion entrada={m.entradaBodega} salida={m.salidaBodega} />,
    align: "right",
  },
  {
    key: "almacen",
    header: "Almacén",
    render: (m) => <CambioUbicacion entrada={m.entradaAlmacen} salida={m.salidaAlmacen} />,
    align: "right",
  },
  {
    key: "saldoBodega",
    header: "Saldo Bodega",
    accessor: (m) => m.saldoBodega,
    render: (m) => formatoCantidad.format(m.saldoBodega),
    align: "right",
  },
  {
    key: "saldoAlmacen",
    header: "Saldo Almacén",
    accessor: (m) => m.saldoAlmacen,
    render: (m) => formatoCantidad.format(m.saldoAlmacen),
    align: "right",
  },
  {
    key: "saldoTotal",
    header: "Saldo total",
    accessor: (m) => m.saldoTotal,
    // Si la base dice que el saldo guardado no cuadra con el recalculado
    // (fn_kardex_producto, saldo_coincide), se marca la fila con un aviso.
    render: (m) => (
      <span className="whitespace-nowrap font-semibold text-zinc-900 dark:text-zinc-100">
        {!m.saldoCoincide && (
          <span
            className="mr-1 text-amber-600 dark:text-amber-400"
            title="El saldo guardado no coincide con el recalculado. Avisar al administrador."
            aria-label="Saldo inconsistente"
          >
            ⚠
          </span>
        )}
        {formatoCantidad.format(m.saldoTotal)}
      </span>
    ),
    align: "right",
  },
  {
    key: "costoUnitario",
    header: "Costo unitario",
    accessor: (m) => m.costoUnitario,
    render: (m) => formatoMoneda.format(m.costoUnitario),
    align: "right",
  },
  {
    key: "costoPromedio",
    header: "Costo promedio",
    accessor: (m) => m.costoPromedio,
    render: (m) => formatoMoneda.format(m.costoPromedio),
    align: "right",
  },
  {
    key: "saldoValorizado",
    header: "Saldo valorizado",
    accessor: (m) => m.saldoValorizado,
    render: (m) => formatoMoneda.format(m.saldoValorizado),
    align: "right",
  },
  {
    key: "usuario",
    header: "Usuario",
    accessor: (m) => m.nombreUsuario,
    render: (m) => <span className="whitespace-nowrap">{m.nombreUsuario || "—"}</span>,
    sortable: true,
  },
];

interface TablaKardexProps {
  movimientos: MovimientoKardex[];
  /** Mensaje cuando no hay movimientos (por ejemplo, ninguno en esas fechas). */
  mensajeVacio: string;
}

export default function TablaKardex({ movimientos, mensajeVacio }: TablaKardexProps) {
  return (
    <DataTable
      columns={columnas}
      data={movimientos}
      getRowKey={(m) => m.idMovimiento}
      initialSort={{ key: "fecha", direction: "asc" }}
      pageSize={10}
      emptyMessage={mensajeVacio}
      caption="Kardex del producto: movimientos en orden cronológico con sus saldos y costos"
    />
  );
}
