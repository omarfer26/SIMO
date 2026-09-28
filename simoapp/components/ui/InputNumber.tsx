"use client";

// SCRUM-108 (Camilo) — Campo numérico base del sistema de componentes
// (components/ui), para precios, cantidades y stock. Se ve igual que
// InputText (etiqueta, borde rojo y mensaje cuando hay error) y además:
//  - Abre el teclado numérico en celular (inputMode="decimal").
//  - Evita que la rueda del mouse cambie el número sin querer: en un
//    <input type="number"> normal, si el campo está enfocado y el usuario
//    hace scroll para bajar por la página, el valor sube o baja solo (por
//    ejemplo, un precio de 50000 pasa a 49999 sin que nadie lo note).
// Es "use client" solo por ese manejo de la rueda del mouse.
// Ojo: como todo <input>, el valor en onChange llega como texto
// (e.target.value); hay que convertirlo con Number(...) al guardarlo.

import { useId, type ComponentProps } from "react";
import Campo, { clasesControl, propsAccesibilidad, type PropsCampo } from "./Campo";

type InputNumberProps = Omit<ComponentProps<"input">, "type"> & PropsCampo;

export default function InputNumber({
  label,
  error,
  hint,
  className,
  id,
  inputMode = "decimal",
  onWheel,
  ...props
}: InputNumberProps) {
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
        type="number"
        inputMode={inputMode}
        onWheel={(e) => {
          // Al quitarle el foco, la rueda vuelve a mover la página en vez
          // de cambiar el número.
          e.currentTarget.blur();
          onWheel?.(e);
        }}
        {...propsAccesibilidad(idCampo, error, hint)}
        className={`${clasesControl(Boolean(error))} px-3`}
      />
    </Campo>
  );
}
