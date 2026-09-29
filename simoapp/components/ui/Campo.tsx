// SCRUM-108 (Camilo) — Pieza interna del sistema de componentes base
// (components/ui). No se usa sola: InputText, InputNumber y Select la usan
// para no repetir tres veces lo mismo — la etiqueta arriba (con asterisco
// rojo si el campo es obligatorio) y, abajo, el mensaje de error en rojo o
// el texto de ayuda en gris. También define las clases de Tailwind del
// "cuadro" del campo, que cambian a rojo cuando hay un error de validación.

// Props que comparten los 3 campos, además de las nativas de HTML
// (name, value, onChange, placeholder, required, disabled, etc.).
export interface PropsCampo {
  /** Texto de la etiqueta que va arriba del campo. */
  label?: string;
  /** Mensaje de error de validación. Si viene, el campo se pinta en rojo. */
  error?: string;
  /** Texto de ayuda en gris debajo del campo (no se muestra si hay error). */
  hint?: string;
}

interface CampoProps extends PropsCampo {
  idCampo: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function idMensaje(idCampo: string) {
  return `${idCampo}-mensaje`;
}

// Conecta el campo con su mensaje (aria-describedby) y lo marca como
// inválido (aria-invalid) cuando hay error, para que un lector de pantalla
// lea el error al enfocar el campo — no solo se vea el color rojo.
export function propsAccesibilidad(
  idCampo: string,
  error?: string,
  hint?: string,
) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? idMensaje(idCampo) : undefined,
  };
}

// Sin padding horizontal a propósito: cada componente pone el suyo (el
// Select necesita más espacio a la derecha para la flecha), y así no quedan
// dos clases de padding peleándose entre sí.
export function clasesControl(conError: boolean) {
  return [
    "block w-full rounded-md border bg-white py-2 text-sm text-zinc-900 placeholder:text-zinc-400",
    "focus:outline-none focus:ring-1",
    "disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500",
    "dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400",
    conError
      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
      : "border-zinc-300 focus:border-emerald-600 focus:ring-emerald-600 dark:border-zinc-700",
  ].join(" ");
}

export default function Campo({
  idCampo,
  label,
  error,
  hint,
  required,
  className,
  children,
}: CampoProps) {
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={idCampo}
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p
          id={idMensaje(idCampo)}
          className="mt-1 flex items-start gap-1 text-xs text-red-600 dark:text-red-400"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="mt-px h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p
          id={idMensaje(idCampo)}
          className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
