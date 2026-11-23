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
//
// SCRUM-158 (Camilo) — Impresión en formato exacto de 80 mm: la hoja mide
// 80 mm × el alto del ticket, y lo impreso sale igual a la vista previa.

import React from "react";
import Button from "@/components/ui/Button";
import type { Cliente } from "@/lib/clientes/tipos";
import type { UsuarioListado } from "@/lib/auth/tipos";
import type { CodigoMetodoPago, ItemCanasta, VentaRegistrada } from "@/lib/ventas/tipos";
import { METODOS_PAGO } from "@/lib/ventas/tipos";
import { useEmpresa } from "@/components/shell/EmpresaContext";

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

// SCRUM-158 (Camilo) — Medidas de la tirilla. El rollo mide 80 mm; las
// impresoras POS imprimen ~72 mm, por eso el ticket deja 4 mm a cada lado.
const ANCHO_ROLLO_MM = 80;
const MM_POR_PX = 25.4 / 96; // en CSS, 1 pulgada = 96 px = 25,4 mm

/** Alto del ticket en mm, redondeado hacia arriba (offsetHeight no se afecta por la animación del modal). */
function altoEnMm(ticket: HTMLElement): number {
  return Math.ceil(ticket.offsetHeight * MM_POR_PX) + 1;
}

/** Hoja de impresión del tamaño exacto del ticket: 80 mm de ancho × su alto. */
function reglaPagina(altoMm: number): string {
  return `@page { size: ${ANCHO_ROLLO_MM}mm ${altoMm}mm; margin: 0; }`;
}

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
  /** SCRUM-73 (Camilo) — Código de referencia de Nequi, Daviplata o Transferencia. */
  referenciaPago?: string;
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
  // (Camilo, 2026-11-10) — Encabezado con los datos reales de la empresa
  // (GET /api/company). Si no cargaron, se imprime solo "SIMO".
  const { empresa } = useEmpresa();
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
    referenciaPago,
  } = datos;

  const nombreMetodo =
    METODOS_PAGO.find((m) => m.codigo === metodoPago)?.nombre ?? metodoPago;

  const fechaImpresion = venta.fecha ? new Date(venta.fecha) : new Date();

  // SCRUM-158 (Camilo) — Para Ctrl+P: mientras el ticket esté en pantalla, la
  // página del navegador mide 80 mm × el alto real del ticket (ver globals.css).
  const refTicket = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const ticket = refTicket.current;
    if (!ticket) return;
    const estilo = document.createElement("style");
    estilo.dataset.simo = "pagina-ticket-80mm";
    document.head.appendChild(estilo);
    const actualizar = () => {
      estilo.textContent = `@media print { ${reglaPagina(altoEnMm(ticket))} }`;
    };
    actualizar();
    const observador = new ResizeObserver(actualizar);
    observador.observe(ticket);
    return () => {
      observador.disconnect();
      estilo.remove();
    };
  }, []);

  // SCRUM-158 (Camilo) — Botón "Imprimir": copia el ticket a un iframe oculto
  // con las MISMAS hojas de estilo de la app (antes era un CSS escrito a mano
  // al que le faltaban clases, y lo impreso no se parecía a la vista previa),
  // mide su alto y le pone una página de 80 mm × ese alto. Así la tirilla
  // sale de una sola pieza, sin hoja Carta y sin papel en blanco al final.
  const imprimiendo = React.useRef(false);
  const ejecutarImpresion = async () => {
    const elementoTicket = refTicket.current;
    if (!elementoTicket || imprimiendo.current) return;
    imprimiendo.current = true;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    // Fuera de la pantalla, pero con el ancho del rollo para que el texto
    // se acomode igual que en la vista previa.
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: `${ANCHO_ROLLO_MM}mm`,
      height: "10px",
      border: "0",
    });
    document.body.appendChild(iframe);

    const quitar = () => {
      iframe.remove();
      imprimiendo.current = false;
    };
    const ventana = iframe.contentWindow;
    const doc = ventana?.document;
    if (!ventana || !doc) {
      quitar();
      window.print(); // globals.css deja solo el ticket en la hoja
      return;
    }

    // Las hojas de estilo de la app (Tailwind + fuentes). `link.href` ya
    // viene como dirección completa, así que sirven dentro del iframe.
    const estilosApp = Array.from(
      document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
        'link[rel="stylesheet"], style:not([data-simo])',
      ),
    )
      .map((nodo) =>
        nodo instanceof HTMLLinkElement
          ? `<link rel="stylesheet" href="${nodo.href}" />`
          : nodo.outerHTML,
      )
      .join("\n");

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="es" class="${document.documentElement.className}">
<head>
<meta charset="utf-8" />
<title>Recibo #${venta.idVenta}</title>
${estilosApp}
<style data-simo="pagina"></style>
</head>
<body>${elementoTicket.outerHTML}</body>
</html>`);
    doc.close();

    // Esperar a que carguen los estilos y la letra antes de medir.
    await Promise.all(
      Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(
        (link) =>
          link.sheet
            ? null
            : new Promise((listo) => {
                link.addEventListener("load", listo, { once: true });
                link.addEventListener("error", listo, { once: true });
              }),
      ),
    );
    await doc.fonts.ready;

    const ticketCopia = doc.getElementById("ticket-impresion");
    const estiloPagina = doc.querySelector<HTMLStyleElement>('style[data-simo="pagina"]');
    if (ticketCopia && estiloPagina) {
      estiloPagina.textContent = reglaPagina(altoEnMm(ticketCopia));
    }

    // El iframe se quita cuando se cierra el diálogo de impresión
    // (o al minuto, por si el navegador no avisa).
    ventana.addEventListener("afterprint", () => setTimeout(quitar, 0), { once: true });
    setTimeout(() => {
      if (document.body.contains(iframe)) quitar();
    }, 60_000);
    ventana.focus();
    ventana.print();
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
      {/* SCRUM-158 (Camilo) — Sin alto mínimo (la vista previa mide lo mismo
          que el papel) y con ring en vez de border (el ring no le quita ancho). */}
      <article
        id="ticket-impresion"
        ref={refTicket}
        className="ticket-termico w-[80mm] bg-white text-black px-[4mm] py-[3mm] font-mono text-[11px] leading-tight shadow-md ring-1 ring-zinc-200"
      >
        {/* Encabezado del Negocio */}
        <header className="text-center space-y-0.5">
          <h1 className="text-sm font-black uppercase tracking-wider">
            {empresa?.razonSocial ?? "SIMO"}
          </h1>
          {empresa?.nit && <p className="text-[10px] font-semibold">NIT: {empresa.nit}</p>}
          {empresa?.direccion && <p className="text-[10px]">{empresa.direccion}</p>}
          {empresa?.telefono && <p className="text-[10px]">Tel: {empresa.telefono}</p>}
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
          <tbody className="divide-y divide-dotted divide-black">
            {items.map((item) => (
              <tr key={item.producto.id} className="align-top">
                <td className="py-1 text-center font-bold">{item.cantidad}</td>
                <td className="py-1 pr-1">
                  <div className="font-semibold leading-tight line-clamp-2">
                    {item.producto.nombre}
                  </div>
                  <div className="text-[9px]">
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
          <div className="flex justify-between text-[9px]">
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
            {referenciaPago && (
              <div className="flex justify-between gap-2">
                <span className="shrink-0">Referencia:</span>
                <span className="break-all text-right font-bold">{referenciaPago}</span>
              </div>
            )}
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
          <p className="text-[8px] leading-tight">
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
