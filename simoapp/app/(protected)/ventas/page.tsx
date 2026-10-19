"use client";

import { useEffect, useRef, useState } from "react";

export default function VentasPage() {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [canasta, setCanasta] = useState<{ id: number; nombre: string; precio: number; cantidad: number }[]>([
    { id: 1, nombre: "Ejemplo: Audífonos X200", precio: 89900, cantidad: 1 },
  ]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // F2 -> procesar cobro
      if (e.key === "F2") {
        e.preventDefault();
        procesarCobro();
        return;
      }

      // Esc -> limpiar canasta
      if (e.key === "Escape") {
        e.preventDefault();
        limpiarCanasta();
        return;
      }

      // F4 -> enfocar barra de búsqueda
      if (e.key === "F4") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canasta]);

  function limpiarCanasta() {
    setCanasta([]);
  }

  function procesarCobro() {
    if (canasta.length === 0) {
      alert("La canasta está vacía.");
      return;
    }
    const total = canasta.reduce((s, i) => s + i.precio * i.cantidad, 0);
    // Aquí iría la lógica real para abrir modal / redirigir a pago.
    alert(`Procesando cobro — total: $${(total / 100).toFixed(2)} (demo)`);
  }

  function agregarProductoEjemplo() {
    const nuevo = {
      id: Date.now(),
      nombre: "Producto demo",
      precio: 15000,
      cantidad: 1,
    };
    setCanasta((c) => [...c, nuevo]);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Punto de Venta (POS)
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Módulo para registro de ventas. Atajos: F2 = Cobrar · Esc = Limpiar
            canasta · F4 = Enfocar búsqueda
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={procesarCobro}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Cobrar (F2)
          </button>
          <button
            type="button"
            onClick={limpiarCanasta}
            className="rounded-md bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-300"
          >
            Limpiar (Esc)
          </button>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
            Buscar producto (F4)
          </label>
          <input
            ref={searchRef}
            type="text"
            placeholder="Código o nombre..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            onKeyDown={(e) => {
              // Si presionan Enter en la búsqueda podemos agregar un producto demo (ejemplo)
              if (e.key === "Enter") {
                e.preventDefault();
                agregarProductoEjemplo();
              }
            }}
          />

          <div className="mt-4">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Canasta</h2>
            {canasta.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">La canasta está vacía.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {canasta.map((item) => (
                  <li key={item.id} className="flex items-center justify-between rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{item.nombre}</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">Cantidad: {item.cantidad}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">${(item.precio / 100).toFixed(2)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Resumen</h3>
          <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            <div className="flex items-center justify-between">
              <span>Items</span>
              <span>{canasta.length}</span>
            </div>
            <div className="mt-2 flex items-center justify-between font-medium">
              <span>Total</span>
              <span>
                ${
                  (canasta.reduce((s, i) => s + i.precio * i.cantidad, 0) / 100).toFixed(2)
                }
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={procesarCobro}
                className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Cobrar (F2)
              </button>
              <button
                onClick={limpiarCanasta}
                className="w-full rounded-md bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-300"
              >
                Limpiar canasta (Esc)
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
