// SCRUM-121 (Camilo) — Guarda la canasta del POS en el navegador
// (localStorage) para que no se pierda si el vendedor recarga o cierra la
// página por error. Se usa localStorage y no sessionStorage porque este
// último se borra al cerrar la pestaña, que es justo lo que se quiere evitar.
//
// Qué se guarda: solo el id de cada producto y la cantidad, más quién y
// cuándo. NO se guarda el precio ni el stock: pueden cambiar mientras tanto,
// así que al recuperar la canasta se cruzan con el catálogo actual
// (reconstruirCanasta) y se usan los datos de ese momento.
//
// Cuándo se descarta lo guardado (decisión de Camilo):
//  - Al cerrar sesión (lo llama cerrarSesion, en lib/auth/sesion.ts).
//  - Si quien abre el POS no es el mismo usuario que la guardó.
//  - Si pasaron más de 8 horas (lo mismo que dura la sesión).
//  - Al confirmar la venta o quitar el último producto (canasta vacía).

import type { Producto } from "@/components/catalogo/tipos";
import type { ItemCanasta } from "./tipos";

const CLAVE_STORAGE = "simo.pos.canasta";
const VIGENCIA_MS = 8 * 60 * 60 * 1000;

interface LineaGuardada {
  id: number;
  cantidad: number;
}

interface CanastaGuardada {
  idUsuario: number | null;
  /** Fecha en milisegundos (Date.now()) de la última vez que se guardó. */
  guardadaEn: number;
  lineas: LineaGuardada[];
}

// Todas las funciones atrapan los errores de localStorage: en una ventana
// privada o con el almacenamiento bloqueado, el POS sigue funcionando igual
// que antes (solo que sin recuperar la canasta).

export function guardarCanasta(items: ItemCanasta[], idUsuario: number | null) {
  if (items.length === 0) {
    borrarCanastaGuardada();
    return;
  }
  const guardada: CanastaGuardada = {
    idUsuario,
    guardadaEn: Date.now(),
    lineas: items.map((item) => ({ id: item.producto.id, cantidad: item.cantidad })),
  };
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(guardada));
  } catch {
    // Almacenamiento lleno o bloqueado: no se guarda y ya.
  }
}

export function borrarCanastaGuardada() {
  try {
    localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Nada que borrar si el almacenamiento está bloqueado.
  }
}

// Devuelve lo guardado si sigue sirviendo, o null. Si lo guardado está
// vencido, es de otro usuario o está dañado, de paso lo borra.
export function leerCanastaGuardada(idUsuario: number | null): CanastaGuardada | null {
  let guardada: unknown;
  try {
    const texto = localStorage.getItem(CLAVE_STORAGE);
    if (!texto) return null;
    guardada = JSON.parse(texto);
  } catch {
    borrarCanastaGuardada();
    return null;
  }

  if (
    !esCanastaGuardada(guardada) ||
    guardada.idUsuario !== idUsuario ||
    Date.now() - guardada.guardadaEn > VIGENCIA_MS
  ) {
    borrarCanastaGuardada();
    return null;
  }
  return guardada;
}

// Revisa que lo leído tenga la forma esperada (alguien pudo editarlo a mano
// en el navegador, o puede venir de una versión vieja del código).
function esCanastaGuardada(valor: unknown): valor is CanastaGuardada {
  if (typeof valor !== "object" || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return (
    (v.idUsuario === null || typeof v.idUsuario === "number") &&
    typeof v.guardadaEn === "number" &&
    Array.isArray(v.lineas) &&
    v.lineas.every(
      (l) =>
        typeof l === "object" &&
        l !== null &&
        Number.isInteger((l as LineaGuardada).id) &&
        typeof (l as LineaGuardada).cantidad === "number" &&
        (l as LineaGuardada).cantidad > 0,
    )
  );
}

export interface CanastaRecuperada {
  items: ItemCanasta[];
  /** Productos que se sacaron porque ya no existen, están inactivos o agotados. */
  quitados: string[];
  /** Productos cuya cantidad se bajó porque ahora hay menos stock. */
  ajustados: string[];
  guardadaEn: Date;
}

// Cruza lo guardado con el catálogo actual. Usa el producto de ahora (con
// su precio y stock de ahora), no el de cuando se guardó.
export function reconstruirCanasta(
  guardada: CanastaGuardada,
  productos: Producto[],
): CanastaRecuperada {
  const items: ItemCanasta[] = [];
  const quitados: string[] = [];
  const ajustados: string[] = [];

  for (const linea of guardada.lineas) {
    const producto = productos.find((p) => p.id === linea.id);
    if (!producto || producto.estado !== "Activo" || producto.stockActual <= 0) {
      quitados.push(producto?.nombre ?? `Producto #${linea.id}`);
      continue;
    }
    if (linea.cantidad > producto.stockActual) {
      ajustados.push(producto.nombre);
      items.push({ producto, cantidad: producto.stockActual });
    } else {
      items.push({ producto, cantidad: linea.cantidad });
    }
  }

  return { items, quitados, ajustados, guardadaEn: new Date(guardada.guardadaEn) };
}
