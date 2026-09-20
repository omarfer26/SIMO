"use client";

// SCRUM-111 (Camilo) — Componente FileUpload: zona de arrastrar-y-soltar (o
// clic) para subir una imagen, con validación de tipo y de tamaño máximo
// (por defecto 2MB, como pide el ticket para el logo). Es "tonto" y
// controlado por el padre: no guarda el archivo elegido en su propio
// estado, solo avisa hacia arriba con `onArchivoSeleccionado` /
// `onQuitar`. Se armó como componente aparte (no solo JSX suelto dentro del
// formulario) porque el ticket lo pide explícitamente como pieza propia, y
// para poder reusarlo si otra pantalla necesita subir imágenes.

import { useEffect, useMemo, useRef, useState } from "react";

interface FileUploadProps {
  archivo: File | null;
  valorActual: string | null;
  onArchivoSeleccionado: (archivo: File) => void;
  onQuitar: () => void;
  maxMB?: number;
}

export default function FileUpload({
  archivo,
  valorActual,
  onArchivoSeleccionado,
  onQuitar,
  maxMB = 2,
}: FileUploadProps) {
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // El archivo elegido es local (todavía no se sube a ningún servidor), así
  // que su preview se arma con una URL temporal del navegador (useMemo, se
  // recalcula solo cuando cambia `archivo`). Esa URL hay que liberarla
  // cuando deje de usarse, si no se queda reservada en memoria sin que
  // nadie la use — de eso se encarga el useEffect de abajo, que solo hace
  // limpieza y no actualiza ningún estado.
  const previewArchivo = useMemo(
    () => (archivo ? URL.createObjectURL(archivo) : null),
    [archivo],
  );

  useEffect(() => {
    return () => {
      if (previewArchivo) URL.revokeObjectURL(previewArchivo);
    };
  }, [previewArchivo]);

  function validarYEmitir(nuevoArchivo: File | undefined) {
    if (!nuevoArchivo) return;

    if (!nuevoArchivo.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen (PNG, JPG, etc.).");
      return;
    }
    if (nuevoArchivo.size > maxMB * 1024 * 1024) {
      setError(`La imagen no debe superar ${maxMB}MB.`);
      return;
    }

    setError(null);
    onArchivoSeleccionado(nuevoArchivo);
  }

  const preview = previewArchivo ?? valorActual;

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          validarYEmitir(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          arrastrando
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
            : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => validarYEmitir(e.target.files?.[0])}
        />

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview de un archivo local (blob:), next/image no lo optimiza
          <img
            src={preview}
            alt="Vista previa del logo"
            className="h-20 w-20 rounded-lg object-cover"
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-8 w-8 text-zinc-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v12.75"
            />
          </svg>
        )}

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Arrastra una imagen o haz clic para elegirla (máx. {maxMB}MB)
        </p>
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {preview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (inputRef.current) inputRef.current.value = "";
            setError(null);
            onQuitar();
          }}
          className="mt-1.5 text-xs font-medium text-red-600 hover:underline"
        >
          Quitar logo
        </button>
      )}
    </div>
  );
}
