"use client";

// Centro de notificaciones — Banner informativo de stock mínimo.
//
// A diferencia del Toast (interrumpe y se va), el Banner es el resumen que
// queda fijo arriba del contenido mientras haya reposiciones pendientes: es lo
// que permite volver a la pantalla cinco minutos después y seguir viendo que
// hay 7 productos por reponer.
//
// Se monta una sola vez en Shell.tsx, debajo de BannerConexion.tsx. No es
// "sticky" para no pelearse con el banner de conexión, que sí lo es.
//
// Reglas de visibilidad:
//  - Nada pendiente        → no se pinta.
//  - "Posponer 30 min"     → se guarda en localStorage (lib/notificaciones/posponer).
//  - Cerrar con la ×       → solo por esta sesión.
//  - Si la cosa EMPEORA (sube el pendiente) → el banner vuelve solo, porque un
//    agotado nuevo es más importante que una preferencia de hace media hora.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProductos } from "@/components/catalogo/ProductosContext";
import { resumirAlertas } from "@/lib/inventario/alertasStock";
import { POSPUESTO_BANNER_MS } from "@/lib/notificaciones/config";
import { formatoHora, formatoUnidades } from "@/lib/notificaciones/formato";
import {
  leerPospuestoVigente,
  posponerBanner,
  reactivarBanner,
} from "@/lib/notificaciones/posponer";

// Cuántos productos se alcanzan a listar antes del "... y N más".
const PRODUCTOS_EN_LISTA = 3;

export default function BannerStockMinimo() {
  const { productos, origen, ultimaSincronizacion } = useProductos();
  // El silencio se recoge en el inicializador del estado y no en un effect:
  // leerPospuestoVigente() atrapa su propio error, así que en el servidor (donde
  // no hay localStorage) devuelve null; y como el banner no pinta nada mientras
  // origen === "cargando", el HTML del servidor y el de la hidratación coinciden
  // igualmente. Con eso se evita el render en cascada que protesta el lint.
  const [pospuestaHasta, setPospuestaHasta] = useState<number | null>(
    leerPospuestoVigente,
  );
  const [cerrada, setCerrada] = useState(false);

  const resumen = useMemo(() => resumirAlertas(productos), [productos]);

  // Al cumplirse la media hora, el banner vuelve sin recargar la página. El
  // setState vive dentro del setTimeout (no en el cuerpo del effect) y borra la
  // llave para que el siguiente montaje no la vuelva a encontrar vigente.
  useEffect(() => {
    if (pospuestaHasta === null) return;
    const temporizador = setTimeout(() => {
      reactivarBanner();
      setPospuestaHasta(null);
    }, pospuestaHasta - Date.now());
    return () => clearTimeout(temporizador);
  }, [pospuestaHasta]);

  // Si aumenta el inventario pendiente se olvidan la posposición y el cierre.
  const pendientesAnteriores = useRef(resumen.total);
  useEffect(() => {
    if (resumen.total > pendientesAnteriores.current) {
      setCerrada(false);
      setPospuestaHasta(null);
      reactivarBanner();
    }
    pendientesAnteriores.current = resumen.total;
  }, [resumen.total]);

  const visible =
    resumen.total > 0 && !cerrada && pospuestaHasta === null && origen !== "cargando";

  if (!visible) return null;

  const enLista = [...resumen.agotados, ...resumen.bajoMinimo].slice(0, PRODUCTOS_EN_LISTA);
  const sobrantes = resumen.total - enLista.length;

  const posponer = () => {
    setPospuestaHasta(posponerBanner(Date.now() + POSPUESTO_BANNER_MS));
  };

  return (
    <div className="no-print mx-auto w-full max-w-7xl px-4 pt-6 sm:px-8">
      <section
        role="status"
        aria-label="Inventario con reposiciones pendientes"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
                resumen.agotados.length > 0 ? "bg-red-600" : "bg-amber-500"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </span>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {formatoUnidades.format(resumen.total)}{" "}
                {resumen.total === 1 ? "producto requiere" : "productos requieren"} reposición
              </p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                {resumen.agotados.length > 0 && (
                  <>
                    <strong className="font-semibold">
                      {formatoUnidades.format(resumen.agotados.length)} agotados
                    </strong>
                    {" · "}
                  </>
                )}
                {formatoUnidades.format(resumen.bajoMinimo.length)} por debajo del stock mínimo ·
                faltan {formatoUnidades.format(resumen.unidadesFaltantes)} unidades para cubrirlos
              </p>

              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-900 dark:text-amber-200">
                {enLista.map((producto) => (
                  <li key={producto.id} className="min-w-0">
                    <span className="font-medium">{producto.nombre}</span>{" "}
                    <span className="opacity-75">
                      ({formatoUnidades.format(producto.stockActual)} / mín{" "}
                      {formatoUnidades.format(producto.stockMinimo)})
                    </span>
                  </li>
                ))}
                {sobrantes > 0 && (
                  <li className="opacity-75">y {formatoUnidades.format(sobrantes)} más…</li>
                )}
              </ul>

              {/* Transparencia sobre la fuente: si el catálogo vino de los datos
                  de prueba, el pendiente mostrado tampoco es real. */}
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-800 dark:text-amber-300">
                {origen === "respaldo" ? (
                  <span className="rounded-full border border-amber-300 px-2 py-0.5 font-semibold dark:border-amber-800">
                    Catálogo de prueba
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-300/70 px-2 py-0.5 font-medium dark:border-amber-800">
                    Inventario del servidor
                  </span>
                )}
                {ultimaSincronizacion && (
                  <span>Sincronizado {formatoHora.format(ultimaSincronizacion)}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/catalogo"
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-950"
            >
              Ver catálogo
            </Link>
            <button
              type="button"
              onClick={posponer}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950"
              title="Ocultar este aviso durante 30 minutos"
            >
              Posponer 30 min
            </button>
            <button
              type="button"
              onClick={() => setCerrada(true)}
              aria-label="Ocultar el aviso de reposición hasta que cambie el inventario"
              className="rounded-md p-1.5 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
