"use client";

// Centro de notificaciones — Provider global de la cola de avisos.
//
// Mismo molde que components/catalogo/ProductosContext.tsx: Context + useState,
// se monta una sola vez en app/(protected)/layout.tsx y sobrevive mientras se
// navega entre páginas. No pinta nada: solo guarda la cola. Quien la muestra es
// components/notificaciones/ContenedorNotificaciones.tsx (los Toasts), la
// Campana del Navbar y el Banner de stock mínimo.
//
// Las cuentas (duplicados, tope de la pila, vencimientos) no viven acá: son
// funciones puras de lib/notificaciones/cola.ts, fáciles de probar sin React.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  contarNoLeidas,
  crearNotificacion,
  descartar,
  encolar,
  marcarLeidas,
  nuevoId,
  sinVencer,
} from "@/lib/notificaciones/cola";
import {
  TICK_VENCIMIENTO_MS,
  type Notificacion,
  type NotificacionNueva,
} from "@/lib/notificaciones/tipos";

interface NotificacionesContextValue {
  /** Avisos visibles, del más reciente al más viejo. */
  cola: Notificacion[];
  /** Cuántos nadie ha visto todavía (el número rojo de la Campana). */
  noLeidas: number;
  /** true mientras el cursor está sobre la pila: los Toasts no se cierran solos. */
  pausada: boolean;
  /** Lanza un aviso y devuelve su id. */
  notificar: (entrada: NotificacionNueva) => string;
  /** Cierra un aviso (botón × del Toast). */
  cerrar: (id: string) => void;
  marcarTodoLeido: () => void;
  vaciar: () => void;
  cambiarPausa: (pausada: boolean) => void;
}

const NotificacionesContext = createContext<NotificacionesContextValue | null>(null);

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const [cola, setCola] = useState<Notificacion[]>([]);
  const [pausada, setPausada] = useState(false);

  // El reloj de vencimiento se mira en un ref y no en las dependencias del
  // efecto: si `pausada` entrara ahí, cada vez que el cursor entra o sale de la
  // pila se montaría un intervalo nuevo y el conteo de los Toasts se reiniciaría.
  // Se actualiza en un efecto (no durante el render) para no tener efectos
  // secundarios dentro de la función de componente.
  const pausadaRef = useRef(pausada);
  useEffect(() => {
    pausadaRef.current = pausada;
  }, [pausada]);

  useEffect(() => {
    const temporizador = setInterval(() => {
      if (pausadaRef.current) return;
      const ahora = Date.now();
      // sinVencer() devuelve la misma referencia si nadie venció, y React no
      // vuelve a pintar cuando el estado no cambia de identidad.
      setCola((actual) => sinVencer(actual, ahora));
    }, TICK_VENCIMIENTO_MS);
    return () => clearInterval(temporizador);
  }, []);

  const notificar = useCallback((entrada: NotificacionNueva) => {
    const ahora = Date.now();
    const notificacion = crearNotificacion(entrada, nuevoId(), ahora);
    setCola((actual) => encolar(actual, notificacion));
    return notificacion.id;
  }, []);

  const cerrar = useCallback((id: string) => {
    setCola((actual) => descartar(actual, id));
  }, []);

  const marcarTodoLeido = useCallback(() => {
    setCola((actual) => marcarLeidas(actual));
  }, []);

  const vaciar = useCallback(() => {
    setCola([]);
  }, []);

  const cambiarPausa = useCallback((nueva: boolean) => {
    setPausada(nueva);
  }, []);

  const noLeidas = useMemo(() => contarNoLeidas(cola), [cola]);

  const valor: NotificacionesContextValue = {
    cola,
    noLeidas,
    pausada,
    notificar,
    cerrar,
    marcarTodoLeido,
    vaciar,
    cambiarPausa,
  };

  return (
    <NotificacionesContext.Provider value={valor}>
      {children}
    </NotificacionesContext.Provider>
  );
}

export function useNotificaciones() {
  const contexto = useContext(NotificacionesContext);
  if (!contexto) {
    throw new Error("useNotificaciones debe usarse dentro de <NotificacionesProvider>");
  }
  return contexto;
}
