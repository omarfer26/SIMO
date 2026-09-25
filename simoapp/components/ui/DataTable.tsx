"use client";

// SCRUM-110 (Camilo) — Tabla de datos base del sistema de componentes
// (components/ui), pensada para reutilizarse en Catálogo, Usuarios y Kardex.
// Nuevo en este componente:
//  - Encabezados dinámicos: las columnas se pasan en `columns`, así cada
//    módulo decide qué muestra y cómo (con `render`) sin copiar la tabla.
//  - Ordenamiento por columna: clic en el encabezado alterna
//    ascendente → descendente → sin orden.
//  - Paginación: botones de página, "Mostrando X–Y de Z" y selector de
//    filas por página.
//  - En pantallas angostas la tabla se desliza de lado dentro de su caja
//    (la página no se mueve).
// La tabla solo ordena y pagina lo que recibe en `data`: buscar y filtrar le
// toca a la página que la usa (como hace BusquedaCatalogo con sus filtros).

import { useMemo, useState, type ReactNode } from "react";

type ValorOrden = string | number | Date | null | undefined;

export interface ColumnaTabla<T> {
  /** Identificador único de la columna (también se usa en `initialSort`). */
  key: string;
  /** Texto del encabezado. */
  header: string;
  /**
   * Valor "crudo" de la fila para esta columna. Se usa para ordenar y, si no
   * hay `render`, es lo que se muestra.
   */
  accessor?: (fila: T) => ValorOrden;
  /** Cómo se dibuja la celda (etiquetas de color, precios con formato...). */
  render?: (fila: T) => ReactNode;
  /** Si se puede ordenar haciendo clic en el encabezado. Necesita `accessor`. */
  sortable?: boolean;
  /** Alineación del texto. Los números y precios van mejor a la derecha. */
  align?: "left" | "center" | "right";
}

export type DireccionOrden = "asc" | "desc";

export interface OrdenTabla {
  key: string;
  direction: DireccionOrden;
}

interface DataTableProps<T> {
  columns: ColumnaTabla<T>[];
  data: T[];
  /** Devuelve un identificador único por fila (normalmente su `id`). */
  getRowKey: (fila: T) => string | number;
  /** Filas por página al arrancar. */
  pageSize?: number;
  /** Opciones del selector de filas por página. */
  pageSizeOptions?: number[];
  /** Orden con el que arranca la tabla (por ejemplo, Kardex: fecha desc). */
  initialSort?: OrdenTabla;
  /** Mensaje cuando `data` viene vacío. */
  emptyMessage?: ReactNode;
  /** Descripción corta de la tabla para lectores de pantalla (no se ve). */
  caption?: string;
}

const clasesAlineacion = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

// Compara dos valores para ordenar. Los vacíos (null/undefined/"") siempre
// quedan al final, sin importar la dirección. El texto se compara en
// español ("Á" junto a "A") y con números naturales ("ITEM-2" antes que
// "ITEM-10").
function esVacio(valor: ValorOrden): valor is null | undefined | "" {
  return valor === null || valor === undefined || valor === "";
}

function compararValores(a: ValorOrden, b: ValorOrden): number {
  if (esVacio(a) || esVacio(b)) {
    return esVacio(a) === esVacio(b) ? 0 : esVacio(a) ? 1 : -1;
  }

  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

export default function DataTable<T>({
  columns,
  data,
  getRowKey,
  pageSize: pageSizeInicial = 10,
  pageSizeOptions = [10, 25, 50],
  initialSort,
  emptyMessage = "No hay registros para mostrar.",
  caption,
}: DataTableProps<T>) {
  const [orden, setOrden] = useState<OrdenTabla | null>(initialSort ?? null);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeInicial);

  const filasOrdenadas = useMemo(() => {
    const columna = orden && columns.find((c) => c.key === orden.key);
    if (!orden || !columna?.accessor) return data;

    const accessor = columna.accessor;
    const signo = orden.direction === "asc" ? 1 : -1;
    // Los vacíos van al final también en orden descendente: por eso no se
    // invierte el resultado cuando uno de los dos está vacío.
    return [...data].sort((filaA, filaB) => {
      const a = accessor(filaA);
      const b = accessor(filaB);
      const resultado = compararValores(a, b);
      return esVacio(a) || esVacio(b) ? resultado : resultado * signo;
    });
  }, [data, columns, orden]);

  const totalFilas = filasOrdenadas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalFilas / pageSize));
  // Si `data` se achica (por ejemplo, al aplicar un filtro) y la página en
  // la que estaba el usuario ya no existe, se muestra la última que sí
  // existe, en vez de una tabla vacía.
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * pageSize;
  const filasPagina = filasOrdenadas.slice(inicio, inicio + pageSize);

  // Ciclo de cada clic en un encabezado: ascendente → descendente → sin
  // orden. Cambiar el orden vuelve a la página 1.
  function alternarOrden(key: string) {
    setOrden((actual) => {
      if (!actual || actual.key !== key) return { key, direction: "asc" };
      if (actual.direction === "asc") return { key, direction: "desc" };
      return null;
    });
    setPagina(1);
  }

  function cambiarPageSize(nuevo: number) {
    setPageSize(nuevo);
    setPagina(1);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* overflow-x-auto: si las columnas no caben (celular), se desliza la
          tabla de lado dentro de este recuadro, no toda la página. */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              {columns.map((columna) => {
                const alineacion = clasesAlineacion[columna.align ?? "left"];
                const ordenable = columna.sortable && columna.accessor;
                const direccion =
                  orden?.key === columna.key ? orden.direction : null;

                return (
                  <th
                    key={columna.key}
                    scope="col"
                    aria-sort={
                      direccion === "asc"
                        ? "ascending"
                        : direccion === "desc"
                          ? "descending"
                          : undefined
                    }
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 ${alineacion}`}
                  >
                    {ordenable ? (
                      <button
                        type="button"
                        onClick={() => alternarOrden(columna.key)}
                        className={`inline-flex items-center gap-1 rounded align-middle uppercase tracking-wide hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:text-zinc-100 ${
                          direccion ? "text-zinc-900 dark:text-zinc-100" : ""
                        } ${columna.align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        {columna.header}
                        <IconoOrden direccion={direccion} />
                      </button>
                    ) : (
                      columna.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {filasPagina.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filasPagina.map((fila) => (
                <tr
                  key={getRowKey(fila)}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                >
                  {columns.map((columna) => (
                    <td
                      key={columna.key}
                      className={`whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300 ${
                        clasesAlineacion[columna.align ?? "left"]
                      }`}
                    >
                      {columna.render
                        ? columna.render(fila)
                        : formatearValor(columna.accessor?.(fila))}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalFilas > 0 && (
        <Paginacion
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
          inicio={inicio}
          filasEnPagina={filasPagina.length}
          totalFilas={totalFilas}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onCambiarPagina={setPagina}
          onCambiarPageSize={cambiarPageSize}
        />
      )}
    </div>
  );
}

// Lo que se muestra cuando una columna no tiene `render`: fechas en formato
// colombiano, y "—" para los vacíos, para que no quede la celda en blanco.
function formatearValor(valor: ValorOrden): ReactNode {
  if (esVacio(valor)) return "—";
  if (valor instanceof Date) return valor.toLocaleDateString("es-CO");
  return valor;
}

interface PaginacionProps {
  paginaActual: number;
  totalPaginas: number;
  inicio: number;
  filasEnPagina: number;
  totalFilas: number;
  pageSize: number;
  pageSizeOptions: number[];
  onCambiarPagina: (pagina: number) => void;
  onCambiarPageSize: (pageSize: number) => void;
}

function Paginacion({
  paginaActual,
  totalPaginas,
  inicio,
  filasEnPagina,
  totalFilas,
  pageSize,
  pageSizeOptions,
  onCambiarPagina,
  onCambiarPageSize,
}: PaginacionProps) {
  const esPrimera = paginaActual === 1;
  const esUltima = paginaActual === totalPaginas;

  return (
    <div className="flex flex-col gap-3 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-400">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Mostrando{" "}
          <strong className="font-medium text-zinc-900 dark:text-zinc-100">
            {inicio + 1}–{inicio + filasEnPagina}
          </strong>{" "}
          de{" "}
          <strong className="font-medium text-zinc-900 dark:text-zinc-100">
            {totalFilas}
          </strong>
        </span>
        <label className="flex items-center gap-2">
          Filas por página
          <select
            value={pageSize}
            onChange={(e) => onCambiarPageSize(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {pageSizeOptions.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav aria-label="Paginación" className="flex items-center gap-1">
        <BotonPagina
          etiqueta="Primera página"
          disabled={esPrimera}
          onClick={() => onCambiarPagina(1)}
          icono="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Zm4 0a.75.75 0 0 1 0 1.06L12.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
        />
        <BotonPagina
          etiqueta="Página anterior"
          disabled={esPrimera}
          onClick={() => onCambiarPagina(paginaActual - 1)}
          icono="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
        />
        <span className="px-2 whitespace-nowrap" aria-live="polite">
          Página {paginaActual} de {totalPaginas}
        </span>
        <BotonPagina
          etiqueta="Página siguiente"
          disabled={esUltima}
          onClick={() => onCambiarPagina(paginaActual + 1)}
          icono="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z"
        />
        <BotonPagina
          etiqueta="Última página"
          disabled={esUltima}
          onClick={() => onCambiarPagina(totalPaginas)}
          icono="M8.22 14.78a.75.75 0 0 1 0-1.06L11.94 10 8.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Zm-4 0a.75.75 0 0 1 0-1.06L7.94 10 4.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z"
        />
      </nav>
    </div>
  );
}

// Botón cuadrado con solo un ícono (flechas de paginación). `etiqueta` es
// lo que lee un lector de pantalla y lo que aparece al pasar el mouse.
function BotonPagina({
  etiqueta,
  icono,
  disabled,
  onClick,
}: {
  etiqueta: string;
  icono: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-zinc-300 bg-white p-1.5 text-zinc-700 transition-colors enabled:hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path fillRule="evenodd" d={icono} clipRule="evenodd" />
      </svg>
    </button>
  );
}

// Flechita del encabezado: ↑ ascendente, ↓ descendente, ↕ gris clarito
// cuando la columna se puede ordenar pero no está ordenada.
function IconoOrden({ direccion }: { direccion: DireccionOrden | null }) {
  const trazo =
    direccion === "asc"
      ? "M10 15V5m0 0-4 4m4-4 4 4"
      : direccion === "desc"
        ? "M10 5v10m0 0-4-4m4 4 4-4"
        : "M7 8l3-3 3 3M7 12l3 3 3-3";

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 ${direccion ? "" : "text-zinc-400 dark:text-zinc-500"}`}
      aria-hidden="true"
    >
      <path d={trazo} />
    </svg>
  );
}
