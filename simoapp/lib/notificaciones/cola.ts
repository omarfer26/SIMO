// Centro de notificaciones — Operaciones sobre la cola de avisos.
//
// Todo son funciones puras `(cola, dato) => cola nueva`, sin React ni DOM,
// para poder probar el comportamiento (duplicados, tope, vencimiento) sin
// montar ninguna pantalla. El provider de components/notificaciones solo
// guarda el resultado en un useState.

import {
  DURACION_POR_VARIANTE,
  LIMITE_COLA,
  type Notificacion,
  type NotificacionNueva,
} from "./tipos";

/**
 * Identificador del aviso. `crypto.randomUUID` existe en los navegadores
 * actuales, pero se deja el remate por texto por si corre en un contexto sin
 * Web Crypto (o en pruebas de Node viejas).
 */
export function nuevoId(): string {
  const cryptoDeVentana = globalThis.crypto;
  if (cryptoDeVentana && typeof cryptoDeVentana.randomUUID === "function") {
    return cryptoDeVentana.randomUUID();
  }
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Convierte lo que pidió quien dispara el aviso en una Notificacion completa. */
export function crearNotificacion(
  entrada: NotificacionNueva,
  id: string,
  ahora: number,
): Notificacion {
  // `duracionMs` no viene (undefined) → la duración de su variante.
  // `duracionMs: null` → no se cierra sola (avisos que deben quedar visibles).
  const duracion =
    entrada.duracionMs === undefined ? DURACION_POR_VARIANTE[entrada.variante] : entrada.duracionMs;

  return {
    id,
    variante: entrada.variante,
    titulo: entrada.titulo,
    detalle: entrada.detalle ?? null,
    origen: entrada.origen,
    creada: ahora,
    venceEn: duracion === null ? null : ahora + duracion,
    clave: entrada.clave ?? null,
    veces: 1,
    leida: false,
    accion: entrada.accion ?? null,
  };
}

/**
 * Mete un aviso arriba de la cola.
 *
 * Si ya hay uno con la misma `clave`, NO se apila: se sube el existente al
 * principio, se le suma `veces` y se le reinicia el reloj. Es lo que evita que
 * un producto que sigue bajo mínimo en tres revalidaciones seguidas produzca
 * tres Toasts iguales.
 */
export function encolar(
  cola: readonly Notificacion[],
  notificacion: Notificacion,
  limite: number = LIMITE_COLA,
): Notificacion[] {
  if (notificacion.clave === null) {
    return [notificacion, ...cola].slice(0, limite);
  }

  const repetida = cola.find((item) => item.clave === notificacion.clave);
  if (!repetida) {
    return [notificacion, ...cola].slice(0, limite);
  }

  const refrescada: Notificacion = {
    ...repetida,
    ...notificacion,
    id: repetida.id,
    creada: repetida.creada,
    veces: repetida.veces + 1,
    leida: false,
  };
  const sinRepetida = cola.filter((item) => item.id !== repetida.id);
  return [refrescada, ...sinRepetida].slice(0, limite);
}

/** Quita un aviso por id (el botón × del Toast). */
export function descartar(
  cola: readonly Notificacion[],
  id: string,
): Notificacion[] {
  return cola.filter((item) => item.id !== id);
}

/**
 * Deja solo los avisos que no han vencido.
 *
 * Devuelve la MISMA referencia de `cola` cuando no sobra ninguno: React compara
 * por identidad y así el reloj de vencimiento no vuelve a pintar la pantalla
 * cada segundo por nada.
 */
export function sinVencer(
  cola: readonly Notificacion[],
  ahora: number,
): Notificacion[] {
  const vivos = cola.filter(
    (item) => item.venceEn === null || item.venceEn > ahora,
  );
  return vivos.length === cola.length ? (cola as Notificacion[]) : vivos;
}

/** Marca todo como visto (abrir la Campana). */
export function marcarLeidas(
  cola: readonly Notificacion[],
): Notificacion[] {
  if (cola.every((item) => item.leida)) return cola as Notificacion[];
  return cola.map((item) => (item.leida ? item : { ...item, leida: true }));
}

/** Cuántos avisos siguen sin verse (el número del ícono de la Campana). */
export function contarNoLeidas(cola: readonly Notificacion[]): number {
  return cola.reduce((total, item) => total + (item.leida ? 0 : 1), 0);
}

/** Cuántos avisos graves (crítico/aviso) hay sin cerrar. El Banner los resume. */
export function contarGraves(cola: readonly Notificacion[]): number {
  return cola.reduce(
    (total, item) =>
      total + (item.variante === "critico" || item.variante === "aviso" ? 1 : 0),
    0,
  );
}
