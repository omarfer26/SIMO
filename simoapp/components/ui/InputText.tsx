// SCRUM-108 (Camilo) — Campo de texto base del sistema de componentes
// (components/ui): etiqueta + caja de texto + mensaje de error o de ayuda.
// Acepta todas las props de un <input> normal (name, value, onChange,
// placeholder, required, disabled...) más `label`, `error` y `hint`. Si se
// le pasa `error`, el borde se pone rojo y el mensaje aparece debajo.
// `className` va al contenedor del campo completo (no a la caja), para
// ubicarlo en una grilla, por ejemplo `md:col-span-2`.

import { useId, type ComponentProps } from "react";
import Campo, { clasesControl, propsAccesibilidad, type PropsCampo } from "./Campo";

type InputTextProps = Omit<ComponentProps<"input">, "type"> &
  PropsCampo & {
    type?: "text" | "email" | "password" | "tel" | "search" | "url";
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

  return (
    <Campo
      idCampo={idCampo}
      label={label}
      error={error}
      hint={hint}
      required={props.required}
      className={className}
    >
      <input
        {...props}
        id={idCampo}
        type={type}
        {...propsAccesibilidad(idCampo, error, hint)}
        className={`${clasesControl(Boolean(error))} px-3`}
      />
    </Campo>
  );
}
