// SCRUM-108 (Camilo) — Campo de texto base del sistema de componentes
// (components/ui): etiqueta + caja de texto + mensaje de error o de ayuda.
// Acepta todas las props de un <input> normal (name, value, onChange,
// placeholder, required, disabled...) más `label`, `error` y `hint`. Si se
// le pasa `error`, el borde se pone rojo y el mensaje aparece debajo.
// `className` va al contenedor del campo completo (no a la caja), para
// ubicarlo en una grilla, por ejemplo `md:col-span-2`.
//
// SCRUM-125 (Camilo) — Ahora también acepta type="date" (el selector de
// fechas del navegador), para el filtro Desde/Hasta de Pedidos.
//
// (Camilo) — Con type="password" aparece un botón de "ojito" a la derecha
// para mostrar u ocultar lo que se escribió. Por eso ahora es componente de
// cliente ("use client"): necesita recordar si la contraseña está visible.

"use client";

import { useId, useState, type ComponentProps } from "react";
import Campo, { clasesControl, propsAccesibilidad, type PropsCampo } from "./Campo";

type InputTextProps = Omit<ComponentProps<"input">, "type"> &
  PropsCampo & {
    type?: "text" | "email" | "password" | "tel" | "search" | "url" | "date";
  };

export default function InputText({
  label,
  error,
  hint,
  className,
  id,
  type = "text",
  ...props
}: InputTextProps) {
  // Si no se pasa `id`, se genera uno único para conectar la etiqueta con
  // la caja (así hacer clic en la etiqueta enfoca el campo).
  const idAutomatico = useId();
  const idCampo = id ?? idAutomatico;

  // Solo se usa con type="password": si es true, el campo pasa a "text" y
  // la contraseña se ve.
  const [verPassword, setVerPassword] = useState(false);
  const esPassword = type === "password";

  return (
    <Campo
      idCampo={idCampo}
      label={label}
      error={error}
      hint={hint}
      required={props.required}
      className={className}
    >
      <div className="relative">
        <input
          {...props}
          id={idCampo}
          type={esPassword && verPassword ? "text" : type}
          {...propsAccesibilidad(idCampo, error, hint)}
          // SCRUM-125 — En modo oscuro, el ícono y el calendario del
          // type="date" también se pintan oscuros (si no, el ícono no se ve).
          // Con contraseña se deja espacio a la derecha para el ojito.
          className={`${clasesControl(Boolean(error))} ${esPassword ? "pl-3 pr-10" : "px-3"} dark:[color-scheme:dark]`}
        />
        {esPassword && (
          <button
            type="button"
            onClick={() => setVerPassword((v) => !v)}
            disabled={props.disabled}
            aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            title={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {verPassword ? (
              // Ojo tachado: la contraseña se está viendo, clic para ocultarla
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              // Ojo abierto: la contraseña está oculta, clic para verla
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </Campo>
  );
}
