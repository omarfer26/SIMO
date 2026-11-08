"use client";

// SCRUM-57 (Camilo) — Buscador para agregar productos a un pedido nuevo
// (parte del formulario "Nuevo pedido"). Busca en el catálogo que ya cargó
// la app (ProductosContext), sin pedirle nada más al backend:
//  - Por nombre o por código (SKU), sin importar mayúsculas ni tildes.
//  - Solo productos activos. Los agotados se pueden pedir igual (el pedido
//    se registra; el stock se revisa al prepararlo), pero se marcan.
//  - Con el teclado: ↑ ↓ para moverse y Enter para agregar. Enter NO envía
//    el formulario del pedido.
//  - Si el producto ya está en el pedido, le suma 1 a su cantidad.

import { useId, useState, type KeyboardEvent } from "react";
import InputText from "@/components/ui/InputText";
import type { Producto } from "@/components/catalogo/tipos";

const MAXIMO_RESULTADOS = 6;

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

// "Electrónica" → "electronica", para que "electronica" la encuentre.
const sinTildes = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface AgregarProductoPedidoProps {
  productos: Producto[];
  /** Ids de los productos que ya están en el pedido. */
  agregados: number[];
  onAgregar: (producto: Producto) => void;
  error?: string;
}

export default function AgregarProductoPedido({
  productos,
  agregados,
  onAgregar,
  error,
}: AgregarProductoPedidoProps) {
  const idLista = useId();
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);

  const termino = sinTildes(texto.trim());
  const resultados = termino
    ? productos
        .filter(
          (p) =>
            p.estado === "Activo" &&
            (sinTildes(p.nombre).includes(termino) || sinTildes(p.codigo).includes(termino)),
        )
        .slice(0, MAXIMO_RESULTADOS)
    : [];
  const indiceActivo = Math.min(activo, resultados.length - 1);

  const agregar = (producto: Producto | undefined) => {
    if (!producto) return;
    onAgregar(producto);
    setTexto("");
    setActivo(0);
  };

  const handleKeyDown = (evento: KeyboardEvent<HTMLInputElement>) => {
    // Enter dentro de un <form> lo enviaría: aquí significa "agregar".
    if (evento.key === "Enter") {
      evento.preventDefault();
      agregar(resultados[indiceActivo]);
      return;
    }
    if (resultados.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setActivo((indiceActivo + 1) % resultados.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setActivo((indiceActivo - 1 + resultados.length) % resultados.length);
    }
  };

  return (
    <div className="relative">
      <InputText
        name="buscarProducto"
        label="Agregar producto"
        placeholder="Nombre o código, ej: cuaderno o PAP-001"
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={resultados.length > 0}
        aria-controls={idLista}
        aria-activedescendant={resultados.length > 0 ? `${idLista}-${indiceActivo}` : undefined}
        error={error}
        hint="Usa ↑ ↓ y Enter para agregar. Si ya está en el pedido, se le suma 1."
      />

      {resultados.length > 0 && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Productos encontrados"
          className="absolute z-20 mt-1 max-h-72 w-full divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {resultados.map((producto, i) => {
            const yaEsta = agregados.includes(producto.id);
            const agotado = producto.stockActual <= 0;
            return (
              <li
                key={producto.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={i === indiceActivo}
                // onMouseDown y no onClick: así el clic llega antes de que
                // el campo pierda el foco.
                onMouseDown={(e) => {
                  e.preventDefault();
                  agregar(producto);
                }}
                onMouseEnter={() => setActivo(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${
                  i === indiceActivo ? "bg-emerald-50 dark:bg-emerald-950/40" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {producto.nombre}
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-mono">{producto.codigo}</span> ·{" "}
                    {formatoMoneda.format(producto.precioVenta)} · {producto.unidadMedida}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  {yaEsta && (
                    <span className="block font-medium text-emerald-700 dark:text-emerald-400">
                      Ya está (+1)
                    </span>
                  )}
                  <span
                    className={
                      agotado ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    {agotado ? "Agotado" : `Stock: ${formatoCantidad.format(producto.stockActual)}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {termino && resultados.length === 0 && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          No hay productos activos con «{texto.trim()}».
        </p>
      )}
    </div>
  );
}
