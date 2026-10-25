"use client";

// Vista de Historial de Ventas con filtros predictivos, visualización de estados
// (COMPLETADA / ANULADA), detalles de la venta y auditoría de anulación.
// Permite accionar la anulación protegida por credenciales gerenciales.

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import InputText from "@/components/ui/InputText";
import { Modal } from "@/components/ui/Modal";
import type { VentaHistorial } from "@/lib/ventas/tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface HistorialVentasProps {
  ventas: VentaHistorial[];
  cargando?: boolean;
  onSolicitarAnulacion: (venta: VentaHistorial) => void;
  onVerComprobante?: (venta: VentaHistorial) => void;
}

export default function HistorialVentas({
  ventas,
  cargando = false,
  onSolicitarAnulacion,
}: HistorialVentasProps) {
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"TODAS" | "COMPLETADA" | "ANULADA">("TODAS");
  const [ventaDetalle, setVentaDetalle] = useState<VentaHistorial | null>(null);

  const ventasFiltradas = ventas.filter((v) => {
    // Filtro por estado
    if (filtroEstado !== "TODAS" && v.estado !== filtroEstado) {
      return false;
    }

    // Filtro por texto (ID, cliente, vendedor, método)
    if (!filtroTexto.trim()) return true;
    const termino = filtroTexto.toLowerCase();
    const idMatch = String(v.idVenta).includes(termino);
    const clienteMatch = v.cliente?.nombre.toLowerCase().includes(termino) ?? false;
    const vendedorMatch = v.vendedor?.nombre.toLowerCase().includes(termino) ?? false;
    const metodoMatch = v.metodoPago.toLowerCase().includes(termino);

    return idMatch || clienteMatch || vendedorMatch || metodoMatch;
  });

  const columnas: ColumnaTabla<VentaHistorial>[] = [
    {
      key: "idVenta",
      header: "N.º Venta",
      accessor: (v) => v.idVenta,
      render: (v) => <span className="font-mono font-semibold">#{v.idVenta}</span>,
      sortable: true,
    },
    {
      key: "fecha",
      header: "Fecha / Hora",
      accessor: (v) => v.fecha,
      render: (v) => (
        <span className="text-xs text-zinc-600 dark:text-zinc-300">
          {formatoFecha.format(new Date(v.fecha))}
        </span>
      ),
      sortable: true,
    },
    {
      key: "cliente",
      header: "Cliente",
      accessor: (v) => v.cliente?.nombre || "Consumidor Final",
      render: (v) => (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {v.cliente?.nombre || "Consumidor Final"}
          </p>
          {v.cliente?.documento && (
            <p className="text-xs text-zinc-500">{v.cliente.documento}</p>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      key: "metodoPago",
      header: "Método de Pago",
      accessor: (v) => v.metodoPago,
      render: (v) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
          {v.metodoPago}
        </span>
      ),
      sortable: true,
    },
    {
      key: "total",
      header: "Total",
      accessor: (v) => v.total,
      align: "right",
      render: (v) => (
        <span
          className={`font-bold ${
            v.estado === "ANULADA"
              ? "text-zinc-400 line-through dark:text-zinc-500"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {formatoMoneda.format(v.total)}
        </span>
      ),
      sortable: true,
    },
    {
      key: "estado",
      header: "Estado",
      accessor: (v) => v.estado,
      render: (v) => (
        <Badge
          variant={v.estado === "COMPLETADA" ? "success" : "danger"}
          size="sm"
          pill
        >
          {v.estado === "COMPLETADA" ? "Completada" : "Anulada"}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: "acciones",
      header: "Acciones",
      accessor: () => "",
      align: "right",
      render: (v) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2.5 h-auto"
            onClick={() => setVentaDetalle(v)}
          >
            Ver Detalle
          </Button>
          {v.estado === "COMPLETADA" ? (
            <Button
              variant="danger"
              className="text-xs py-1 px-2.5 h-auto"
              onClick={() => onSolicitarAnulacion(v)}
            >
              Anular
            </Button>
          ) : (
            <span className="text-xs text-zinc-400 italic px-2">Sin acción</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="w-full sm:w-96">
          <InputText
            name="buscar-venta"
            placeholder="🔍 Buscar por N.° venta, cliente, método..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            autoComplete="off"
          />
        </div>

        {/* Filtro por Estado */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFiltroEstado("TODAS")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filtroEstado === "TODAS"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Todas ({ventas.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado("COMPLETADA")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filtroEstado === "COMPLETADA"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-700 dark:text-emerald-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Completadas ({ventas.filter((v) => v.estado === "COMPLETADA").length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroEstado("ANULADA")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filtroEstado === "ANULADA"
                ? "bg-white text-red-700 shadow-xs dark:bg-zinc-700 dark:text-red-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Anuladas ({ventas.filter((v) => v.estado === "ANULADA").length})
          </button>
        </div>
      </div>

      {/* Tabla de Ventas */}
      {cargando ? (
        <div className="py-12 text-center text-zinc-500">Cargando transacciones de venta...</div>
      ) : (
        <DataTable
          columns={columnas}
          data={ventasFiltradas}
          getRowKey={(v) => v.idVenta}
          initialSort={{ key: "idVenta", direction: "desc" }}
          caption="Historial de Ventas y Transacciones"
          emptyMessage="No se encontraron ventas con los criterios especificados."
        />
      )}

      {/* Modal de Detalle de Venta */}
      <Modal
        isOpen={Boolean(ventaDetalle)}
        onClose={() => setVentaDetalle(null)}
        title={`Detalle de Venta #${ventaDetalle?.idVenta}`}
        maxWidth="lg"
      >
        {ventaDetalle && (
          <div className="space-y-4 text-sm">
            {/* Estado y Auditoría si fue Anulada */}
            {ventaDetalle.estado === "ANULADA" && ventaDetalle.anulacion && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-400">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Esta venta fue ANULADA</span>
                </div>
                <p className="text-xs">
                  <strong>Fecha de anulación:</strong>{" "}
                  {formatoFecha.format(new Date(ventaDetalle.anulacion.fecha))}
                </p>
                <p className="text-xs">
                  <strong>Autorizado por:</strong> {ventaDetalle.anulacion.autorizadoPor} (
                  {ventaDetalle.anulacion.rolAutorizador})
                </p>
                <p className="text-xs">
                  <strong>Motivo:</strong> {ventaDetalle.anulacion.motivo}
                </p>
              </div>
            )}

            {/* Cabecera de la Transacción */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div>
                <span className="text-xs text-zinc-500 block">Fecha y Hora</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatoFecha.format(new Date(ventaDetalle.fecha))}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Cliente</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {ventaDetalle.cliente?.nombre || "Consumidor Final"}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Vendedor / Cajero</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {ventaDetalle.vendedor?.nombre || "No especificado"}
                </span>
              </div>
              <div>
                <span className="text-xs text-zinc-500 block">Medio de Pago</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {ventaDetalle.metodoPago}
                </span>
              </div>
            </div>

            {/* Lista de Artículos */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Artículos de la transacción
              </h4>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800">
                {ventaDetalle.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {item.nombreProducto}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono">
                        {item.codigoProducto} · {item.cantidad} und. x {formatoMoneda.format(item.precioUnitario)}
                      </p>
                    </div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatoMoneda.format(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totales */}
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 flex flex-col items-end gap-1">
              <div className="flex justify-between w-48 text-xs text-zinc-500">
                <span>Subtotal:</span>
                <span>{formatoMoneda.format(ventaDetalle.subtotal)}</span>
              </div>
              {ventaDetalle.descuento > 0 && (
                <div className="flex justify-between w-48 text-xs text-emerald-600">
                  <span>Descuento:</span>
                  <span>- {formatoMoneda.format(ventaDetalle.descuento)}</span>
                </div>
              )}
              <div className="flex justify-between w-48 text-base font-bold text-zinc-900 dark:text-zinc-100 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <span>Total:</span>
                <span className={ventaDetalle.estado === "ANULADA" ? "line-through text-red-500" : ""}>
                  {formatoMoneda.format(ventaDetalle.total)}
                </span>
              </div>
            </div>

            {/* Botones de Pie */}
            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              {ventaDetalle.estado === "COMPLETADA" && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const v = ventaDetalle;
                    setVentaDetalle(null);
                    onSolicitarAnulacion(v);
                  }}
                >
                  Anular esta Venta
                </Button>
              )}
              <Button variant="secondary" onClick={() => setVentaDetalle(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
