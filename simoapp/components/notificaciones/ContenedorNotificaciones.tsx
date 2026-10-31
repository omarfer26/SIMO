"use client";

// Centro de notificaciones — Pila de Toasts flotantes.
//
// Se monta una sola vez en app/(protected)/layout.tsx y se saca del árbol por
// createPortal hacia document.body (el mismo truco de components/ui/Modal.tsx),
// para que ningún `overflow-hidden` ni el z-index de una tabla le corte el
// aviso. Mientras la cola esté vacía no se pinta nada, así que el servidor
// nunca llega a evaluar `document`.
//
// Pausar al pasar el mouse encima (y al enfocar con teclado) es lo que evita
// que un aviso crítico se cierre antes de terminarlo de leer.

import { createPortal } from "react-dom";
import Toast from "@/components/ui/Toast";
import { useNotificaciones } from "./NotificacionesContext";

export default function ContenedorNotificaciones() {
  const { cola, cerrar, cambiarPausa } = useNotificaciones();

  // La cola arranca vacía y solo se llena desde efectos del cliente (el Vigilante,
  // los escaneos del POS), nunca en el render del servidor. Ese guard hace el
  // trabajo de la bandera `mounted` de Modal.tsx: sin avisos no se abre portal,
  // así que `document.body` no se toca fuera del navegador.
  if (cola.length === 0) return null;

  return createPortal(
    // `top-16`: abajo del Navbar (h-14 = 3.5rem) sin taparlo.
    // `pointer-events-none` en el marco para no bloquear los botones de la
    // página; la pila interna sí recibe clics.
    <div className="no-print pointer-events-none fixed inset-x-0 top-16 z-[90] flex justify-end px-3 sm:left-auto sm:right-4 sm:px-0">
      <div
        className="pointer-events-auto flex w-full max-w-sm flex-col gap-2"
        onMouseEnter={() => cambiarPausa(true)}
        onMouseLeave={() => cambiarPausa(false)}
        onFocusCapture={() => cambiarPausa(true)}
        onBlurCapture={() => cambiarPausa(false)}
      >
        {cola.map((notificacion) => (
          <Toast key={notificacion.id} notificacion={notificacion} onCerrar={cerrar} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
