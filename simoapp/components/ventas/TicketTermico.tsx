"use client";

// Componente para maquetación e impresión de Ticket / Comprobante Térmico (80mm)
// Compatible con impresoras térmicas POS estándar de 80mm (rollo térmico continuo).
// Incluye:
// - Encabezado comercial (Razón social, NIT, Dirección, Teléfono)
// - Consecutivo de venta / fecha / hora
// - Cajero en turno y Cliente / Consumidor Final
// - Detalle de productos (Cantidad, Descripción, Precio Unitario, Importe)
// - Subtotal, Descuento, Impuestos (IVA discriminado) y Total en COP
// - Método de pago, recibido y cambio
// - Pie de comprobante con mensaje de agradecimiento y resolución DIAN/Facturación

import React from "react";
import Button from "@/components/ui/Button";
import type { Cliente } from "@/lib/clientes/tipos";
import type { UsuarioListado } from "@/lib/auth/tipos";
import type { CodigoMetodoPago, ItemCanasta, VentaRegistrada } from "@/lib/ventas/tipos";
import { METODOS_PAGO } from "@/lib/ventas/tipos";
import { empresaMock } from "@/components/shell/datos.mock";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface DatosTicket {
  venta: VentaRegistrada;
  items: ItemCanasta[];
  cliente: Cliente | null;
  cajero: UsuarioListado | null;
  metodoPago: CodigoMetodoPago;
  subtotal: number;
  descuento: number;
  impuestos: number;
  total: number;
  recibido?: number;
  cambio?: number;
}

interface TicketTermicoProps {
  datos: DatosTicket;
  onCerrar?: () => void;
  imprimirAlMontar?: boolean;
}

export default function TicketTermico({
  datos,
  onCerrar,
  imprimirAlMontar = false,
}: TicketTermicoProps) {
  const {
    venta,
    items,
    cliente,
    cajero,
    metodoPago,
    subtotal,
    descuento,
    impuestos,
    total,
    recibido = 0,
    cambio = 0,
  } = datos;

  const nombreMetodo =
    METODOS_PAGO.find((m) => m.codigo === metodoPago)?.nombre ?? metodoPago;

  const fechaImpresion = venta.fecha ? new Date(venta.fecha) : new Date();

  // Función para imprimir únicamente el ticket de 80mm de forma aislada
  // Crea un documento temporal (iframe / ventana de impresión) exclusivamente con el comprobante,
  // eliminando por completo el fondo del POS y limpiándolo de memoria al terminar.
  const ejecutarImpresion = () => {
    const elementoTicket = document.getElementById("ticket-impresion");
    if (!elementoTicket) return;

    // Crear un iframe temporal invisible
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const docIframe = iframe.contentWindow?.document;
    if (!docIframe) {
      window.print();
      return;
    }

    // Estilos CSS exactos para tirilla continua de 80mm
    const contenidoHTML = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Recibo #${venta.idVenta}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            width: 76mm;
            max-width: 76mm;
            margin: 0 auto;
            padding: 4mm 2mm;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 11px;
            line-height: 1.25;
          }
          header { text-align: center; margin-bottom: 6px; }
          h1 { font-size: 13px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0; }
          th, td { font-size: 10px; padding: 2px 0; }
          th { border-bottom: 1px dashed #000000; text-align: left; }
          tbody tr { border-bottom: 1px dotted #888888; }
          .flex { display: flex; justify-content: space-between; align-items: flex-start; }
          .justify-between { justify-content: space-between; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: 700; }
          .font-black { font-weight: 900; }
          .font-semibold { font-weight: 600; }
          .uppercase { text-transform: uppercase; }
          .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .border-b { border-bottom: 1px dashed #000000; }
          .border-t { border-top: 1px dashed #000000; }
          .border-y { border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; }
          .border-dashed { border-style: dashed; }
          .border-black { border-color: #000000; }
          .my-2 { margin-top: 6px; margin-bottom: 6px; }
          .pt-1 { padding-top: 4px; }
          .pb-2 { padding-bottom: 6px; }
          .text-zinc-600 { color: #4b5563; }
        </style>
      </head>
      <body>
        ${elementoTicket.innerHTML}
      </body>
      </html>
    `;

    docIframe.open();
    docIframe.write(contenidoHTML);
    docIframe.close();

    // Esperar a que renderice e invocar impresión aislada
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      // Eliminar el documento temporal una vez atendida la impresión
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  };

  React.useEffect(() => {
    if (imprimirAlMontar) {
      const timer = setTimeout(() => {
        ejecutarImpresion();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [imprimirAlMontar]);

  const totalUnidades = items.reduce((acc, it) => acc + it.cantidad, 0);

  return (
    <div className="flex flex-col items-center">
      {/* Botones de acción (ocultos al imprimir) */}
      <div className="no-print mb-4 flex w-full max-w-[80mm] items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <Button
          type="button"
          onClick={ejecutarImpresion}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Imprimir Recibo (80mm)
        </Button>
        {onCerrar && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCerrar}
            className="text-xs"
          >
            Listo
          </Button>
        )}
      </div>

      {/* Tirilla Térmica de 80mm */}
      <article
        id="ticket-impresion"
        className="ticket-termico w-[80mm] min-h-[120mm] bg-white text-black p-3 font-mono text-[11px] leading-tight shadow-md border border-zinc-200 print:border-none print:shadow-none print:p-0 print:m-0"
      >
        {/* Encabezado del Negocio */}
        <header className="text-center space-y-0.5">
          <h1 className="text-sm font-black uppercase tracking-wider">
            {empresaMock.razonSocial}
          </h1>
          <p className="text-[10px] font-semibold">NIT: {empresaMock.nit}</p>
          <p className="text-[10px]">{empresaMock.direccion}</p>
          <p className="text-[10px]">Tel: {empresaMock.telefono}</p>
          <div className="py-1">
            <span className="inline-block border-y border-dashed border-black px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest">
              Tirilla de Venta POS
            </span>
          </div>
        </header>

        {/* Metadatos de la Venta */}
        <div className="my-2 border-b border-dashed border-black pb-2 text-[10px] space-y-0.5">
          <div className="flex justify-between">
            <span className="font-bold">Factura / Ticket:</span>
            <span className="font-bold">#{venta.idVenta}</span>
          </div>
          <div className="flex justify-between">
            <span>Fecha y Hora:</span>
            <span>{formatoFecha.format(fechaImpresion)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cajero / Vendedor:</span>
            <span className="truncate max-w-[45mm] text-right font-medium">
              {cajero ? cajero.nombreCompleto : "Caja Principal"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Cliente:</span>
            <span className="truncate max-w-[45mm] text-right">
              {cliente ? cliente.nombre : "Consumidor Final"}
            </span>
          </div>
          {cliente && (
            <div className="flex justify-between">
              <span>Doc. Cliente:</span>
              <span>{cliente.tipoDocumento} {cliente.documento}</span>
            </div>
          )}
        </div>

        {/* Tabla de Productos */}
        <table className="w-full text-left my-2 border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="py-1 w-[8mm] text-center">Cant</th>
              <th className="py-1">Descripción</th>
              <th className="py-1 text-right">Subt.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dotted divide-zinc-400">
            {items.map((item) => (
              <tr key={item.producto.id} className="align-top">
                <td className="py-1 text-center font-bold">{item.cantidad}</td>
                <td className="py-1 pr-1">
                  <div className="font-semibold leading-tight line-clamp-2">
                    {item.producto.nombre}
                  </div>
                  <div className="text-[9px] text-zinc-600">
                    SKU: {item.producto.codigo} | @ {formatoMoneda.format(item.producto.precioVenta)}
                  </div>
                </td>
                <td className="py-1 text-right font-medium whitespace-nowrap">
                  {formatoMoneda.format(item.producto.precioVenta * item.cantidad)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Resumen de Liquidación */}
        <div className="border-t border-dashed border-black pt-1.5 space-y-0.5 text-[10px]">
          <div className="flex justify-between">
            <span>Total artículos:</span>
            <span className="font-bold">{totalUnidades} und.</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatoMoneda.format(subtotal)}</span>
          </div>
          {descuento > 0 && (
            <div className="flex justify-between font-medium">
              <span>Descuento aplicado:</span>
              <span>-{formatoMoneda.format(descuento)}</span>
            </div>
          )}
          <div className="flex justify-between text-[9px] text-zinc-600">
            <span>IVA incluido (19% est.):</span>
            <span>{formatoMoneda.format(impuestos > 0 ? impuestos : Math.round(total * 0.19 / 1.19))}</span>
          </div>

          {/* Gran Total */}
          <div className="flex justify-between text-xs font-black border-y border-black py-1 my-1">
            <span className="uppercase">TOTAL A PAGAR:</span>
            <span>{formatoMoneda.format(total)}</span>
          </div>

          {/* Detalle de Pago */}
          <div className="pt-0.5 space-y-0.5">
            <div className="flex justify-between">
              <span>Medio de Pago:</span>
              <span className="font-bold uppercase">{nombreMetodo}</span>
            </div>
            {metodoPago === "EFECTIVO" && recibido > 0 && (
              <>
                <div className="flex justify-between">
                  <span>Efectivo Recibido:</span>
                  <span>{formatoMoneda.format(recibido)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Cambio devuelto:</span>
                  <span>{formatoMoneda.format(cambio)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pie de Recibo / Resolución */}
        <footer className="mt-3 pt-2 border-t border-dashed border-black text-center space-y-1 text-[9px]">
          <p className="font-semibold">¡GRACIAS POR SU COMPRA!</p>
          <p className="text-[8px] leading-tight text-zinc-600">
            Régimen Simple de Tributación • Sistema SIMO POS
            <br />
            Conserve este comprobante para cambios o reclamos de garantía.
          </p>
          <div className="pt-1 text-[8px] tracking-tighter">
            *** SOFTWARE SIMO POS v1.0 ***
          </div>
        </footer>
      </article>
    </div>
  );
}
