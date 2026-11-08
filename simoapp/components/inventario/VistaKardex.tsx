"use client";

// SCRUM-39 (Camilo) — Todo lo que se ve en /kardex, de arriba a abajo:
//  1. Selector de producto. El producto elegido vive en la dirección
//     (/kardex?producto=3), así el enlace "Ver Kardex" del catálogo llega con
//     el producto ya elegido y la página se puede recargar o compartir.
//  2. Resumen con el saldo actual según el Kardex: Bodega, Almacén, total,
//     costo promedio y valor del inventario de ese producto.
//  3. Filtro por rango de fechas (el mismo de pedidos, SCRUM-125).
//  4. La tabla cronológica (TablaKardex).
// Los movimientos se piden con obtenerKardex() (mock mientras no exista el
// endpoint) cada vez que cambia el producto.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useProductos } from "@/components/catalogo/ProductosContext";
import FiltroFechasPedidos, {
  RANGO_VACIO,
  fechaEnRango,
  hayRango,
  rangoInvalido,
  type RangoFechas,
} from "@/components/pedidos/FiltroFechasPedidos";
import TablaKardex from "./TablaKardex";
import { mensajeErrorKardex, obtenerKardex } from "@/lib/inventario/kardexService";
import type { MovimientoKardex } from "@/lib/inventario/tipos";

const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

// Resultado de la última consulta. `clave` dice de qué producto (y de qué
// intento) es, para saber si lo que hay en pantalla ya es del producto
// elegido o todavía se está cargando.
type Resultado =
  | { clave: string; tipo: "listo"; movimientos: MovimientoKardex[] }
  | { clave: string; tipo: "error"; mensaje: string };

export default function VistaKardex() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { productos, origen } = useProductos();

  const idElegido = Number(searchParams.get("producto")) || null;
  const producto = productos.find((p) => p.id === idElegido);

  const [rango, setRango] = useState<RangoFechas>(RANGO_VACIO);
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const clave = producto ? `${producto.id}-${intento}` : "";

  useEffect(() => {
    if (!producto) return;
    let vigente = true;
    const claveConsulta = `${producto.id}-${intento}`;
    obtenerKardex(producto)
      .then((movimientos) => {
        if (vigente) setResultado({ clave: claveConsulta, tipo: "listo", movimientos });
      })
      .catch((error) => {
        if (vigente) setResultado({ clave: claveConsulta, tipo: "error", mensaje: mensajeErrorKardex(error) });
      });
    return () => {
      vigente = false;
    };
  }, [producto, intento]);

  const cargando = Boolean(producto) && resultado?.clave !== clave;
  const movimientos = !cargando && resultado?.tipo === "listo" ? resultado.movimientos : [];
  const filtrados =
    hayRango(rango) && !rangoInvalido(rango)
      ? movimientos.filter((m) => fechaEnRango(m.fecha, rango))
      : movimientos;
  // El saldo actual es el del último movimiento (la lista llega en orden).
  const ultimo = movimientos.at(-1);

  const elegirProducto = (id: string) => {
    router.replace(id ? `/kardex?producto=${id}` : "/kardex", { scroll: false });
  };

  return (
    <div className="space-y-6">
      {/* 1. Producto */}
      <div className="max-w-md">
        {origen === "cargando" ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <Select
            label="Producto"
            name="producto"
            placeholder="Elige un producto"
            value={producto ? String(producto.id) : ""}
            options={productos.map((p) => ({ value: String(p.id), label: `${p.codigo} · ${p.nombre}` }))}
            onChange={(e) => elegirProducto(e.target.value)}
            hint={
              idElegido && !producto
                ? "No encontramos ese producto. Elige otro de la lista."
                : undefined
            }
          />
        )}
      </div>

      {origen !== "cargando" && !producto && (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Elige un producto para ver su Kardex, o entra desde el botón «Ver Kardex» de una tarjeta del{" "}
          <Link href="/catalogo" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            catálogo
          </Link>
          .
        </p>
      )}

      {producto && (
        <>
          {/* 2. Resumen */}
          <section aria-label="Saldo actual según el Kardex">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{producto.nombre}</p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {producto.codigo} · {producto.unidadMedida} · {producto.categoria}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Dato titulo="Bodega" valor={ultimo && formatoCantidad.format(ultimo.saldoBodega)} cargando={cargando} />
              <Dato titulo="Almacén" valor={ultimo && formatoCantidad.format(ultimo.saldoAlmacen)} cargando={cargando} />
              <Dato titulo="Total" valor={ultimo && formatoCantidad.format(ultimo.saldoTotal)} cargando={cargando} />
              <Dato titulo="Costo promedio" valor={ultimo && formatoMoneda.format(ultimo.costoPromedio)} cargando={cargando} />
              <Dato titulo="Valor en inventario" valor={ultimo && formatoMoneda.format(ultimo.saldoValorizado)} cargando={cargando} />
            </div>
          </section>

          {/* 3. Fechas y 4. Tabla */}
          {cargando ? (
            <div className="space-y-2" role="status" aria-label="Cargando Kardex">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : resultado?.tipo === "error" ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              <span>{resultado.mensaje}</span>
              <Button variant="secondary" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              <FiltroFechasPedidos
                rango={rango}
                onCambiar={setRango}
                mostrados={filtrados.length}
                total={movimientos.length}
                nombres={{ singular: "movimiento", plural: "movimientos" }}
              />
              <TablaKardex
                movimientos={filtrados}
                mensajeVacio={
                  movimientos.length === 0
                    ? "Este producto todavía no tiene movimientos."
                    : "No hay movimientos entre esas fechas."
                }
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Dato({ titulo, valor, cargando }: { titulo: string; valor?: string; cargando: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{titulo}</p>
      {cargando ? (
        <Skeleton className="mt-1 h-6 w-16" />
      ) : (
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{valor ?? "—"}</p>
      )}
    </div>
  );
}
