// SCRUM-108 (Camilo) — Botón base del sistema de componentes (components/ui).
// Tres variantes:
//  - primary: la acción principal de la pantalla (Guardar, Crear, Confirmar).
//  - secondary: acciones neutras o de salida (Cancelar, Volver, Limpiar).
//  - danger: acciones destructivas o que no se pueden deshacer (Anular
//    venta, Cancelar pedido, Eliminar).
// Acepta todas las props de un <button> normal (onClick, disabled, form...),
// y `className` se agrega al final, para cosas de ubicación como `w-full`.

import type { ComponentProps } from "react";

export type VarianteBoton = "primary" | "secondary" | "danger";

const clasesVariante: Record<VarianteBoton, string> = {
  primary:
    "border-transparent bg-emerald-600 text-white enabled:hover:bg-emerald-700 focus-visible:ring-emerald-600",
  secondary:
    "border-zinc-300 bg-white text-zinc-700 enabled:hover:bg-zinc-50 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:enabled:hover:bg-zinc-800",
  danger:
    "border-transparent bg-red-600 text-white enabled:hover:bg-red-700 focus-visible:ring-red-600",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: VarianteBoton;
};

// `type` arranca en "button" (el navegador, por defecto, usa "submit"): así
// un botón dentro de un <form> no lo envía por accidente. Para el botón que
// sí debe enviar el formulario hay que pasar type="submit" a propósito.
export default function Button({
  variant = "primary",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900 ${clasesVariante[variant]} ${className}`}
      {...props}
    />
  );
}
