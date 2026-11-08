// Centro de notificaciones — Redacción de los avisos.
//
// Traduce sucesos del dominio (un cambio de stock, una revalidación que falló)
// a `NotificacionNueva`: texto y severidad, sin JSX ni clases de Tailwind. El
// texto vive acá para que el Toast, la Campana y el Banner digan exactamente lo
// mismo, y para poder cambiar el mensaje sin tocar componentes.

import {
  deficitDeFoto,
  type CambioStock,
  type InstantaneaStock,
} from "@/lib/inventario/alertasStock";
import { AGRUPAR_DESDE } from "./config";
import { formatoUnidades, textoStock } from "./formato";
import type { AccionNotificacion, NotificacionNueva } from "./tipos";

// Enlaces de acción. Solo rutas que existen hoy: /catalogo (inventario) y /
// (Dashboard, con la tabla de rotación y su aviso "⚠" de reposición). La ruta
// /alertas del Sidebar sigue siendo placeholder, así que no se enlaza ahí.
export const ACCION_VER_INVENTARIO: AccionNotificacion = {
  etiqueta: "Ver catálogo",
  href: "/catalogo",
};

export const ACCION_VER_REPOSICION: AccionNotificacion = {
  etiqueta: "Ver reposición",
  href: "/",
};

/** Opciones que afectan el texto, no la severidad. */
export interface OpcionesMensaje {
  /**
   * El catálogo viene de los productos de prueba porque el backend no
   * respondió (`origen` = "respaldo" en ProductosContext). Se aclara en el
   * detalle: un aviso de inventario falso sin decirlo incumple la regla de
   * transparencia sobre la fuente de los datos.
   */
  dePrueba?: boolean;
}

const NOTA_PRUEBA = "catálogo de prueba";

/** Añade la nota de origen al detalle, solo cuando hace falta. */
function conNota(texto: string, opciones?: OpcionesMensaje): string {
  return opciones?.dePrueba ? `${texto} (${NOTA_PRUEBA})` : texto;
}

/**
 * Clave que identifica el aviso de un producto. Incluye el estado, para que un
 * producto que pasa de "bajo mínimo" a "agotado" sea un aviso nuevo (más grave)
 * y no uno repetido.
 */
function claveProducto(foto: InstantaneaStock): string {
  return `stock:${foto.id}:${foto.estado}`;
}

function nombreUnidad(foto: InstantaneaStock): string {
  return foto.unidadMedida.trim().toLowerCase() || "unidades";
}

function detalleDeAgotado(foto: InstantaneaStock): string {
  const minimo =
    foto.stockMinimo > 0
      ? `mínimo ${formatoUnidades.format(foto.stockMinimo)}`
      : "sin mínimo configurado";
  return `${foto.codigo} · quedó en 0 ${nombreUnidad(foto)}, ${minimo}.`;
}

function detalleDeBajo(foto: InstantaneaStock): string {
  const faltante = deficitDeFoto(foto);
  return `${foto.codigo} · quedan ${textoStock(foto.stockActual, foto.stockMinimo)} ${nombreUnidad(foto)}, faltan ${formatoUnidades.format(faltante)} para el mínimo.`;
}

/** Un producto que cruzó una frontera de stock, convertido en aviso. */
export function notificacionPorCambio(
  cambio: CambioStock,
  opciones?: OpcionesMensaje,
): NotificacionNueva {
  const { actual, sentido } = cambio;
  const detalle =
    sentido === "mejoro"
      ? `${actual.codigo} · vuelven a ser ${textoStock(actual.stockActual, actual.stockMinimo)} ${nombreUnidad(actual)}.`
      : actual.estado === "agotado"
        ? detalleDeAgotado(actual)
        : detalleDeBajo(actual);

  const titulo =
    sentido === "mejoro"
      ? `Stock recuperado: ${actual.nombre}`
      : actual.estado === "agotado"
        ? `Agotado: ${actual.nombre}`
        : `Bajo stock mínimo: ${actual.nombre}`;

  return {
    variante:
      sentido === "mejoro"
        ? "exito"
        : actual.estado === "agotado"
          ? "critico"
          : "aviso",
    origen: "inventario",
    titulo,
    detalle: conNota(detalle, opciones),
    clave: `${claveProducto(actual)}:${sentido}`,
    accion: sentido === "mejoro" ? null : ACCION_VER_INVENTARIO,
  };
}

/**
 * Avisos por producto o un solo resumen, según cuántos cambiaron a la vez.
 *
 * Una venta en el POS baja el stock de 5 productos: cinco Toasts apilados no
 * se leen. A partir de AGRUPAR_DESDE empeores se manda uno que dice cuántos
 * son y cuáles son los tres más urgentes.
 */
export function notificacionesDesdeCambios(
  cambios: readonly CambioStock[],
  opciones?: OpcionesMensaje,
): NotificacionNueva[] {
  const empeores = cambios.filter((cambio) => cambio.sentido === "empeoro");
  const mejores = cambios.filter((cambio) => cambio.sentido === "mejoro");

  const avisos: NotificacionNueva[] = [];

  if (empeores.length >= AGRUPAR_DESDE) {
    const resumen = notificacionResumen(empeores, opciones);
    if (resumen) avisos.push(resumen);
  } else {
    // Uno por uno, del más grave al menos grave (detectarCambios ya los ordena).
    for (const cambio of empeores) {
      avisos.push(notificacionPorCambio(cambio, opciones));
    }
  }

  for (const cambio of mejores) {
    avisos.push(notificacionPorCambio(cambio, opciones));
  }

  return avisos;
}

/** Resumen de varios productos que cayeron a alerta en el mismo barrido. */
export function notificacionResumen(
  empeores: readonly CambioStock[],
  opciones?: OpcionesMensaje,
): NotificacionNueva | null {
  if (empeores.length === 0) return null;

  const agotados = empeores.filter((cambio) => cambio.actual.estado === "agotado");
  const bajos = empeores.length - agotados.length;
  const hayAgotados = agotados.length > 0;

  const cabeza = agotados.length > 0
    ? `${agotados.length} sin stock`
    : `${bajos} por debajo del mínimo`;
  const resto =
    agotados.length > 0 && bajos > 0 ? ` · ${bajos} bajo el mínimo` : "";

  const nombres = empeores.slice(0, 3).map((cambio) => cambio.actual.nombre);
  const sobrantes = empeores.length - nombres.length;
  const lista = `${nombres.join(", ")}${sobrantes > 0 ? ` y ${sobrantes} más` : ""}`;

  return {
    variante: hayAgotados ? "critico" : "aviso",
    origen: "inventario",
    titulo: `${empeores.length} productos requieren reposición`,
    detalle: conNota(`${cabeza}${resto}: ${lista}.`, opciones),
    clave: `stock:resumen:${empeores.length}:${hayAgotados ? "agotado" : "bajo"}`,
    accion: ACCION_VER_REPOSICION,
  };
}

/**
 * El sondeo periódico no pudo leer el backend. Se repite con la misma clave,
 * así que la cola lo agrupa ("×2", "×3") en lugar de acumular Toasts iguales
 * mientras el servidor siga caído.
 */
export function notificacionRevalidacionFallida(): NotificacionNueva {
  return {
    variante: "aviso",
    origen: "sistema",
    titulo: "No se pudo revalidar el inventario",
    detalle:
      "El stock que se ve en pantalla puede estar desactualizado. Se reintenta en el próximo sondeo.",
    clave: "sistema:revalidacion",
  };
}

/** Cuando el último producto pendiente queda cubierto. */
export function notificacionInventarioRegularizado(): NotificacionNueva {
  return {
    variante: "exito",
    origen: "inventario",
    titulo: "Inventario sin reposiciones pendientes",
    detalle: "Ningún producto activo queda por debajo de su stock mínimo.",
    clave: "stock:regularizado",
  };
}
