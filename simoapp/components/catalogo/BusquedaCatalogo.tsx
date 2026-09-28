"use client";

// SCRUM-31 (Camilo) — Barra de búsqueda del catálogo con filtros acumulativos.
// Nuevo en este componente:
//  - Búsqueda en vivo por código/nombre (filtra en cada tecla, sin botón).
//  - Filtros de categoría + disponibilidad + estado que se combinan con AND,
//    es decir, se acumulan entre sí en vez de reemplazarse (ver
//    `productosFiltrados` más abajo).
//  - Estado vacío con botón "Limpiar filtros" cuando ningún producto cumple
//    la combinación de filtros elegida.

import { useMemo, useState } from "react";
import { productosMock } from "./productos.mock";
import type {
  FiltroCategoria,
  FiltroDisponibilidad,
  FiltroEstado,
  Producto,
} from "./tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

// El backend aún no expone /productos: por eso `productos` tiene un valor
// por defecto (los datos de prueba) pero se puede pasar por props cuando
// exista el fetch real, sin tocar la lógica de filtrado de este componente.
interface BusquedaCatalogoProps {
  productos?: Producto[];
}

export default function BusquedaCatalogo({
  productos = productosMock,
}: BusquedaCatalogoProps) {
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<FiltroCategoria>("todas");
  const [disponibilidad, setDisponibilidad] =
    useState<FiltroDisponibilidad>("todos");
  const [estado, setEstado] = useState<FiltroEstado>("todos");

  const categorias = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria))).sort(),
    [productos],
  );

  const productosFiltrados = useMemo(() => {
    const textoNormalizado = texto.trim().toLowerCase();

    return productos.filter((producto) => {
      const coincideTexto =
        textoNormalizado === "" ||
        producto.codigo.toLowerCase().includes(textoNormalizado) ||
        producto.nombre.toLowerCase().includes(textoNormalizado);

      const coincideCategoria =
        categoria === "todas" || producto.categoria === categoria;

      const disponible = producto.stockActual > 0;
      const coincideDisponibilidad =
        disponibilidad === "todos" ||
        (disponibilidad === "disponible" && disponible) ||
        (disponibilidad === "agotado" && !disponible);

      const coincideEstado = estado === "todos" || producto.estado === estado;

      // Los 4 criterios van con AND: un producto solo se muestra si cumple
      // el texto Y la categoría Y la disponibilidad Y el estado a la vez.
      return (
        coincideTexto &&
        coincideCategoria &&
        coincideDisponibilidad &&
        coincideEstado
      );
    });
  }, [productos, texto, categoria, disponibilidad, estado]);

  const hayFiltrosActivos =
    texto !== "" ||
    categoria !== "todas" ||
    disponibilidad !== "todos" ||
    estado !== "todos";

  function limpiarFiltros() {
    setTexto("");
    setCategoria("todas");
    setDisponibilidad("todos");
    setEstado("todos");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 10.5A6.5 6.5 0 1 1 4 10.5a6.5 6.5 0 0 1 13 0Z"
          />
        </svg>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código o nombre..."
          className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Categoría
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as FiltroCategoria)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="todas">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Disponibilidad
          <select
            value={disponibilidad}
            onChange={(e) =>
              setDisponibilidad(e.target.value as FiltroDisponibilidad)
            }
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="todos">Todas</option>
            <option value="disponible">Disponible</option>
            <option value="agotado">Agotado</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Estado
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as FiltroEstado)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="todos">Todos</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </label>

        <button
          type="button"
          onClick={limpiarFiltros}
          disabled={!hayFiltrosActivos}
          className="ml-auto self-end rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Limpiar filtros
        </button>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {productosFiltrados.length}{" "}
        {productosFiltrados.length === 1
          ? "producto encontrado"
          : "productos encontrados"}
      </p>

      {productosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No se encontraron productos con esos filtros.
          </p>
          <button
            type="button"
            onClick={limpiarFiltros}
            className="rounded-md bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productosFiltrados.map((producto) => {
            const disponible = producto.stockActual > 0;
            return (
              <li
                key={producto.id}
                className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {producto.nombre}
                    </p>
                    <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {producto.codigo}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      producto.estado === "Activo"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {producto.estado}
                  </span>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {producto.categoria} · {producto.unidadMedida}
                </p>

                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatoMoneda.format(producto.precioVenta)}
                  </span>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      disponible
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                  >
                    {disponible
                      ? `Disponible (${producto.stockActual})`
                      : "Agotado"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
