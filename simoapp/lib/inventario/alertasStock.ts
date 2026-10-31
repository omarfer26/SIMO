// Centro de notificaciones — Reglas de alerta sobre el stock mínimo.
//
// Funciones puras: reciben el catálogo (`Producto` de components/catalogo/tipos)
// y devuelven datos, nunca JSX ni estado. Aquí vive LA regla, en un solo sitio,
// para que el Toast, el Banner, la Campana y el dashboard coincidan:
//
//   "bajo mínimo" = stockActual <= stockMinimo
//
// que es exactamente lo que ya calcula lib/dashboard/metricas.ts en
// `requiereReposicion` (línea 273) y lo que pinta TablaRotacionStock.tsx. Si la
// regla cambiara, se cambia aquí y en ningún otro lado.
//
// De dónde sale `stockMinimo`: de la columna `stock_minimo_bodega` de la tabla
// `productos` (backend/db/migrations/003_catalogo.sql), que
// components/catalogo/ProductosContext.tsx copia en `aProducto()`.

import type { Producto } from "@/components/catalogo/tipos";

export type EstadoStock = "agotado" | "bajoMinimo" | "normal";

/** Gravedad del estado: 0 = lo peor. Sirve para ordenar y para comparar. */
const GRAVEDAD: Record<EstadoStock, number> = {
  agotado: 0,
  bajoMinimo: 1,
  normal: 2,
};

/**
 * Estado de stock de un producto.
 *
 * - Un producto INACTIVO nunca alerta: no se vende, así que no urge reponerlo.
 * - `stockMinimo <= 0` significa "sin regla de mínimo configurada", así que no
 *   se queja por estar bajo mínimo (pero sí se agota).
 */
export function estadoStock(producto: Producto): EstadoStock {
  if (producto.estado !== "Activo") return "normal";
  if (producto.stockActual <= 0) return "agotado";
  if (producto.stockMinimo > 0 && producto.stockActual <= producto.stockMinimo) {
    return "bajoMinimo";
  }
  return "normal";
}

/** true = hay que reponer (agotado o por debajo del mínimo). */
export function enReposicion(producto: Producto): boolean {
  return estadoStock(producto) !== "normal";
}

/** Unidades que faltan para volver a cubrir el mínimo; 0 si no aplica. */
export function deficitUnidades(producto: Producto): number {
  if (producto.stockMinimo <= 0) return 0;
  return Math.max(0, producto.stockMinimo - producto.stockActual);
}

/**
 * Huella del stock de un producto. Se guarda entre barridos para poder decir
 * "de 8 bajó a 3" sin tener que conservar el Producto completo (que además
 * cambia de identidad en cada refresh del catálogo).
 */
export interface InstantaneaStock {
  id: number;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  stockActual: number;
  stockMinimo: number;
  estado: EstadoStock;
}

export function instantaneaDe(producto: Producto): InstantaneaStock {
  return {
    id: producto.id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    unidadMedida: producto.unidadMedida,
    stockActual: producto.stockActual,
    stockMinimo: producto.stockMinimo,
    estado: estadoStock(producto),
  };
}

/** Foto del catálogo keyed por id de producto. */
export function instantaneaStock(
  productos: readonly Producto[],
): Map<number, InstantaneaStock> {
  const mapa = new Map<number, InstantaneaStock>();
  for (const producto of productos) {
    mapa.set(producto.id, instantaneaDe(producto));
  }
  return mapa;
}

export type SentidoCambio = "empeoro" | "mejoro";

export interface CambioStock {
  /** null cuando el producto recién entra en el radar (alta en el catálogo). */
  anterior: InstantaneaStock | null;
  actual: InstantaneaStock;
  sentido: SentidoCambio;
}

function graveDe(estado: EstadoStock | null | undefined): number {
  // Acepta undefined porque la foto anterior puede no existir (`anterior?.estado`
  // sobre un producto que acaba de entrar al catálogo).
  // Un producto nuevo se compara contra "normal": si llegó con alerta, cuenta
  // como ingreso y se avisa (es lo que pasó al crear un producto con mínimo 10
  // y stock 0 desde /formuProductos).
  return GRAVEDAD[estado ?? "normal"];
}

/**
 * Compara la foto anterior con el catálogo actual y devuelve los productos que
 * cruzaron una frontera de stock (ok → bajo mínimo, bajo → agotado, o al
 * revés al entrar mercancía a bodega).
 *
 * Los que cambian de cantidad pero se quedan en el mismo estado NO aparecen:
 * es la diferencia entre "avisa cuando importa" y "avisa en cada venta".
 */
export function detectarCambios(
  anteriores: ReadonlyMap<number, InstantaneaStock>,
  productos: readonly Producto[],
): CambioStock[] {
  const cambios: CambioStock[] = [];

  for (const producto of productos) {
    const actual = instantaneaDe(producto);
    const anterior = anteriores.get(actual.id) ?? null;
    if (actual.estado === (anterior?.estado ?? "normal")) continue;

    const empeoro = graveDe(actual.estado) < graveDe(anterior?.estado);
    if (empeoro) {
      cambios.push({ anterior, actual, sentido: "empeoro" });
    } else {
      cambios.push({ anterior, actual, sentido: "mejoro" });
    }
  }

  return cambios.sort((a, b) => {
    // Primero los empeores, y entre ellos los más graves y con más faltante.
    if (a.sentido !== b.sentido) return a.sentido === "empeoro" ? -1 : 1;
    const porGravedad = graveDe(a.actual.estado) - graveDe(b.actual.estado);
    if (porGravedad !== 0) return porGravedad;
    return deficitDeFoto(b.actual) - deficitDeFoto(a.actual);
  });
}

/** Unidades que faltan para cubrir el mínimo, sobre una foto del stock. */
export function deficitDeFoto(foto: InstantaneaStock): number {
  if (foto.stockMinimo <= 0) return 0;
  return Math.max(0, foto.stockMinimo - foto.stockActual);
}

export interface ResumenAlertas {
  /** Sin unidades, ordenados por faltante (los más urgentes primero). */
  agotados: Producto[];
  /** Con algo de stock, pero por debajo del mínimo. */
  bajoMinimo: Producto[];
  /** agotados.length + bajoMinimo.length */
  total: number;
  /** Suma de unidades que hacen falta para cubrir todos los mínimos. */
  unidadesFaltantes: number;
}

/**
 * Inventario pendiente de reposición, tal como lo ve el Banner y la Campana.
 * No modifica el catálogo: solo lo recorre y ordena.
 */
export function resumirAlertas(productos: readonly Producto[]): ResumenAlertas {
  const agotados: Producto[] = [];
  const bajoMinimo: Producto[] = [];
  let unidadesFaltantes = 0;

  for (const producto of productos) {
    const estado = estadoStock(producto);
    if (estado === "normal") continue;
    unidadesFaltantes += deficitUnidades(producto);
    if (estado === "agotado") agotados.push(producto);
    else bajoMinimo.push(producto);
  }

  const porFaltante = (a: Producto, b: Producto) =>
    deficitUnidades(b) - deficitUnidades(a) || a.nombre.localeCompare(b.nombre, "es");

  return {
    agotados: agotados.sort(porFaltante),
    bajoMinimo: bajoMinimo.sort(porFaltante),
    total: agotados.length + bajoMinimo.length,
    unidadesFaltantes,
  };
}
