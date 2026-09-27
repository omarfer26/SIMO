// SCRUM-108 (Camilo) — Lista desplegable base del sistema de componentes
// (components/ui). Se ve igual que InputText (etiqueta, borde rojo y mensaje
// cuando hay error) y tiene su propia flecha, para que se vea igual en
// todos los navegadores. Las opciones se pasan como arreglo en `options`
// (también acepta <option> escritos a mano como hijos). Con `placeholder`
// se agrega una primera opción vacía tipo "Seleccione una categoría".

import { useId, type ComponentProps } from "react";
import Campo, { clasesControl, propsAccesibilidad, type PropsCampo } from "./Campo";

export interface OpcionSelect {
  value: string;
  label: string;
  disabled?: boolean;
}

type SelectProps = ComponentProps<"select"> &
  PropsCampo & {
    options?: OpcionSelect[];
    placeholder?: string;
  };

export default function Select({
  label,
  error,
  hint,
  className,
  id,
  options = [],
  placeholder,
  children,
  ...props
}: SelectProps) {
  const idAutomatico = useId();
  const idCampo = id ?? idAutomatico;

  // La opción del placeholder está deshabilitada (no se puede volver a
  // elegir), y el navegador salta las opciones deshabilitadas al escoger
  // cuál mostrar primero. Por eso, si no se pasa ni `value` ni
  // `defaultValue`, se arranca en "" a propósito: si no, en vez del
  // placeholder aparecería ya elegida la primera opción real.
  const defaultValue =
    placeholder !== undefined &&
    props.value === undefined &&
    props.defaultValue === undefined
      ? ""
      : props.defaultValue;

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
        <select
          {...props}
          id={idCampo}
          defaultValue={defaultValue}
          {...propsAccesibilidad(idCampo, error, hint)}
          className={`${clasesControl(Boolean(error))} appearance-none pl-3 pr-9`}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opcion) => (
            <option
              key={opcion.value}
              value={opcion.value}
              disabled={opcion.disabled}
            >
              {opcion.label}
            </option>
          ))}
          {children}
        </select>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </Campo>
  );
}
