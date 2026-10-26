"use client";

// Dashboard Operacional — página de inicio de la app ("/").
//
// Tablero visual con las métricas de la operación: ingresos y ventas por
// período, medios de pago, y rotación de stock por producto. Los gráficos se
// dibujan con Recharts y el resto del layout con TailwindCSS.
//
// DE DÓNDE SALEN LOS DATOS
//  - Ventas: `listarVentas()`, el mismo historial que muestra /ventas (API
//    real si NEXT_PUBLIC_VENTAS_MOCK=false; si no, el historial local de
//    demostración). Por eso una venta recién registrada en el POS aparece
//    acá al entrar o al tocar "Actualizar".
//  - Stock: `useProductos()`, que trae el catálogo del backend (GET
//    /api/products) y cae en los productos de prueba si no responde.
// Las cuentas no viven en la pantalla sino en lib/dashboard/metricas.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useProductos } from "@/components/catalogo/ProductosContext";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import GraficoMetodosPago from "@/components/dashboard/GraficoMetodosPago";
import GraficoRotacionStock from "@/components/dashboard/GraficoRotacionStock";
import GraficoVentasPeriodo from "@/components/dashboard/GraficoVentasPeriodo";
import PanelDashboard from "@/components/dashboard/PanelDashboard";
import SelectorPeriodo from "@/components/dashboard/SelectorPeriodo";
import TarjetaMetrica from "@/components/dashboard/TarjetaMetrica";
import TablaRotacionStock from "@/components/dashboard/TablaRotacionStock";
import {
  formatoFechaCorta,
  formatoFechaHora,
  formatoMoneda,
  formatoNumero,
} from "@/lib/dashboard/formato";
import { calcularDashboard, PERIODOS_DASHBOARD, TOP_ROTACION } from "@/lib/dashboard/metricas";
import type { PeriodoDashboard } from "@/lib/dashboard/tipos";
import { listarVentas } from "@/lib/ventas/anulacionService";
import type { VentaHistorial } from "@/lib/ventas/tipos";

// Íconos (trazo, 24x24) de las tarjetas de indicadores.
const ICONO_INGRESOS =
  "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";
const ICONO_VENTAS =
  "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.907-4.807 2.309-7.4a.75.75 0 0 0-.738-.866H5.106M7.5 14.25 5.106 5.272M6 18.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z";
const ICONO_UNIDADES =
  "M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z";
const ICONO_ROTACION =
  "M16.023 9.348h4.992V4.356m0 4.992-3.181-3.183a8.25 8.25 0 0 0-13.803 3.7M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7";

const mensajeErrorHistorial =
  "No pudimos leer el historial de ventas. Revisa la conexión con el servidor e inténtalo de nuevo.";

export default function DashboardPage() {
  const { productos, origen } = useProductos();

  const [periodo, setPeriodo] = useState<PeriodoDashboard>("30d");
  const [ventas, setVentas] = useState<VentaHistorial[]>([]);
  const [cargandoVentas, setCargandoVentas] = useState(true);
  const [error, setError] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  // Primera carga. Los setState van dentro de .then/.catch (no en el cuerpo
  // del efecto) para no encadenar renders apenas se monta la página.
  useEffect(() => {
    let vigente = true;

    listarVentas()
      .then((historial) => {
        if (!vigente) return;
        setVentas(historial);
        setActualizadoEn(new Date());
      })
      .catch((fallo) => {
        if (!vigente) return;
        console.error("No se pudo cargar el historial de ventas del tablero", fallo);
        setError(mensajeErrorHistorial);
      })
      .finally(() => {
        if (vigente) setCargandoVentas(false);
      });

    return () => {
      vigente = false;
    };
  }, []);

  // Botón "Actualizar": vuelve a leer el historial (por ejemplo, después de
  // cobrar en el POS) sin recargar la página.
  const actualizar = useCallback(async () => {
    setCargandoVentas(true);
    setError("");
    try {
      const historial = await listarVentas();
      setVentas(historial);
      setActualizadoEn(new Date());
    } catch (fallo) {
      console.error("No se pudo actualizar el historial de ventas del tablero", fallo);
      setError(mensajeErrorHistorial);
    } finally {
      setCargandoVentas(false);
    }
  }, []);

  const datos = useMemo(
    () =>
      calcularDashboard({
        ventas,
        productos,
        periodo,
        ahora: actualizadoEn ?? new Date(),
      }),
    [ventas, productos, periodo, actualizadoEn],
  );

  const conMovimiento = datos.rotacion.filter((producto) => producto.unidadesVendidas > 0);
  const rotacionPromedio =
    conMovimiento.length > 0
      ? conMovimiento.reduce((suma, producto) => suma + producto.indiceRotacion, 0) /
        conMovimiento.length
      : 0;
  const enReposicion = datos.rotacion.filter((producto) => producto.requiereReposicion).length;

  const cargando = cargandoVentas || origen === "cargando";
  const opcionPeriodo = PERIODOS_DASHBOARD.find((opcion) => opcion.id === periodo);
  const rangoTexto = `${formatoFechaCorta.format(datos.rango.desde)} – ${formatoFechaCorta.format(datos.rango.hasta)}`;
  const historialDeEjemplo = process.env.NEXT_PUBLIC_VENTAS_MOCK !== "false";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
      {/* Encabezado: título, rango activo y controles */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Panel operativo
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Dashboard Operacional
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Ventas por período, medios de pago y rotación de stock de la operación.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                  clipRule="evenodd"
                />
              </svg>
              {opcionPeriodo?.descripcion}: <strong className="font-semibold">{rangoTexto}</strong>
            </span>

            {/* Transparencia: mientras el POS use el historial de ejemplo,
                conviene que quien mira el tablero lo sepa. */}
            {historialDeEjemplo && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                title="NEXT_PUBLIC_VENTAS_MOCK no está en 'false': las ventas son datos de demostración."
              >
                Historial de demostración
              </span>
            )}

            {actualizadoEn && (
              <span className="text-zinc-500 dark:text-zinc-400">
                Actualizado {formatoFechaHora.format(actualizadoEn)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <SelectorPeriodo periodo={periodo} onCambiar={setPeriodo} />
          <Button
            variant="secondary"
            onClick={() => void actualizar()}
            disabled={cargandoVentas}
            title="Volver a leer el historial de ventas"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 ${cargandoVentas ? "animate-spin" : ""}`}
              aria-hidden="true"
            >
              <path d={ICONO_ROTACION} />
            </svg>
            {cargandoVentas ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {/* El catálogo vino de los datos de prueba: los indicadores de stock no
          son el inventario real. */}
      {origen === "respaldo" && (
        <p
          role="status"
          className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          No se pudo conectar con el servidor: el stock y la rotación se calculan con productos
          de prueba, no con el inventario real.
        </p>
      )}

      {cargando ? (
        <div className="mt-6 space-y-6" aria-busy="true" aria-label="Cargando indicadores">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((indice) => (
              <Skeleton key={indice} className="h-32" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Skeleton className="h-96 xl:col-span-2" />
            <Skeleton className="h-96" />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      ) : (
        <>
          {/* Indicadores del período */}
          <section
            aria-label="Indicadores del período"
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <TarjetaMetrica
              titulo="Ingresos del período"
              valor={formatoMoneda.format(datos.resumen.ingresos)}
              icono={ICONO_INGRESOS}
              tono="emerald"
              variacion={datos.resumen.variacionIngresos}
              detalle={`${formatoNumero.format(datos.resumen.ventas)} ventas completadas`}
            />
            <TarjetaMetrica
              titulo="Ventas completadas"
              valor={formatoNumero.format(datos.resumen.ventas)}
              icono={ICONO_VENTAS}
              tono="sky"
              variacion={datos.resumen.variacionVentas}
              detalle={`Ticket promedio ${formatoMoneda.format(datos.resumen.ticketPromedio)}`}
            />
            <TarjetaMetrica
              titulo="Unidades vendidas"
              valor={formatoNumero.format(datos.resumen.unidadesVendidas)}
              icono={ICONO_UNIDADES}
              tono="violet"
              variacion={datos.resumen.variacionUnidades}
              detalle={`${formatoNumero.format(datos.resumen.ventasAnuladas)} anuladas (${formatoMoneda.format(datos.resumen.montoAnulado)})`}
            />
            <TarjetaMetrica
              titulo="Rotación promedio"
              valor={`${rotacionPromedio.toLocaleString("es-CO", { maximumFractionDigits: 2 })}x`}
              icono={ICONO_ROTACION}
              tono="amber"
              detalle={`${formatoNumero.format(enReposicion)} productos en reposición`}
            />
          </section>

          {/* Ventas del período y medios de pago */}
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <PanelDashboard
              className="xl:col-span-2"
              titulo="Ventas por período"
              descripcion={`${opcionPeriodo?.descripcion ?? ""} · ${rangoTexto}`}
              acciones={
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {datos.granularidad === "semana" ? "Agrupado por semana" : "Agrupado por día"}
                </span>
              }
            >
              <GraficoVentasPeriodo serie={datos.serie} />
            </PanelDashboard>

            <PanelDashboard
              titulo="Medios de pago"
              descripcion="Participación en los ingresos del período"
            >
              <GraficoMetodosPago
                datos={datos.metodosPago}
                total={datos.resumen.ingresos}
              />
            </PanelDashboard>
          </div>

          {/* Rotación de stock: gráfico + detalle */}
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PanelDashboard
              titulo="Rotación de stock"
              descripcion={`Top ${TOP_ROTACION} por índice de rotación · ${rangoTexto}`}
            >
              <GraficoRotacionStock datos={datos.rotacion} />
            </PanelDashboard>

            <PanelDashboard
              titulo="Detalle por producto"
              descripcion="Unidades vendidas, stock disponible y cobertura"
            >
              <TablaRotacionStock datos={datos.rotacion} />
            </PanelDashboard>
          </div>
        </>
      )}

      {/* Metodología: sin esto, un "3,21x" no dice nada. */}
      <p className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Los indicadores se calculan con las ventas completadas del historial y con el stock actual
        del catálogo. Rotación = unidades vendidas ÷ inventario promedio, estimado como el stock
        actual más la mitad de lo vendido en el período. La cobertura son los días que alcanza el
        stock al ritmo de venta del período. Las ventas anuladas no suman a los ingresos.
      </p>
    </main>
  );
}
