"use client";

// SCRUM-73 (Camilo) — Sección "Soporte del pago" para Nequi, Daviplata y
// Transferencia. Sale debajo de los métodos de pago en "Confirmar venta"
// (POS) y en "Convertir en venta" (/pedidos). Tiene dos partes:
//  1. Código de referencia del comprobante (obligatorio).
//  2. Comprobante: pantallazo (JPG, PNG, WEBP) o PDF, hasta 5 MB (opcional).
//     Se puede elegir con clic o arrastrándolo al recuadro. Si es imagen, se
//     ve en miniatura; si es PDF, se ve su nombre y tamaño.
// No guarda nada por sí solo: el modal que lo usa recibe el código y el
// archivo por `onReferencia` y `onComprobante`, y los valida al confirmar.

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import InputText from "@/components/ui/InputText";
import { METODOS_PAGO, type CodigoMetodoPago } from "@/lib/ventas/tipos";
import {
  ACEPTA_COMPROBANTE,
  LARGO_MAXIMO_REFERENCIA,
  TAMANO_MAXIMO_COMPROBANTE,
  formatoTamano,
  validarComprobante,
} from "@/lib/ventas/soportePago";

interface SoportePagoDigitalProps {
  metodo: CodigoMetodoPago;
  referencia: string;
  onReferencia: (texto: string) => void;
  comprobante: File | null;
  onComprobante: (archivo: File | null) => void;
  errorReferencia?: string;
  disabled?: boolean;
}

export default function SoportePagoDigital({
  metodo,
  referencia,
  onReferencia,
  comprobante,
  onComprobante,
  errorReferencia,
  disabled = false,
}: SoportePagoDigitalProps) {
  const [errorArchivo, setErrorArchivo] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const idArchivo = useId();
  const nombreMetodo = METODOS_PAGO.find((m) => m.codigo === metodo)?.nombre ?? metodo;

  // Revisa el archivo antes de aceptarlo: si no sirve, muestra por qué y
  // deja el que había (o ninguno).
  const elegirArchivo = (archivo: File | undefined) => {
    if (!archivo) return;
    const error = validarComprobante(archivo);
    setErrorArchivo(error ?? "");
    if (!error) onComprobante(archivo);
    // Se limpia el input para que elegir el mismo archivo otra vez también avise.
    if (inputArchivo.current) inputArchivo.current.value = "";
  };

  const quitarArchivo = () => {
    onComprobante(null);
    setErrorArchivo("");
  };

  const alSoltar = (evento: DragEvent<HTMLLabelElement>) => {
    evento.preventDefault();
    setArrastrando(false);
    if (!disabled) elegirArchivo(evento.dataTransfer.files[0]);
  };

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Soporte del pago por {nombreMetodo}
        </h4>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Pídele al cliente el comprobante de la transacción y copia su código.
          Queda guardado con la venta para poder revisarlo después.
        </p>
      </div>

      {/* 1. Código de referencia */}
      <InputText
        label="Código de referencia"
        name="referenciaPago"
        required
        autoComplete="off"
        maxLength={LARGO_MAXIMO_REFERENCIA}
        placeholder="Ej.: M1234567"
        disabled={disabled}
        value={referencia}
        onChange={(e) => onReferencia(e.target.value)}
        error={errorReferencia}
        hint="Sale en el comprobante como referencia, número de aprobación o de transacción."
      />

      {/* 2. Comprobante (opcional) */}
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Comprobante <span className="font-normal text-zinc-500 dark:text-zinc-400">(opcional)</span>
        </p>

        {/* El input está escondido pero sigue funcionando: el recuadro es su
            etiqueta, así que clic, teclado y lector de pantalla lo abren. */}
        <input
          ref={inputArchivo}
          id={idArchivo}
          type="file"
          accept={ACEPTA_COMPROBANTE}
          disabled={disabled}
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
          aria-describedby={errorArchivo ? `${idArchivo}-error` : undefined}
          className="sr-only"
        />

        {comprobante ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            <VistaPrevia archivo={comprobante} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={comprobante.name}>
                {comprobante.name}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {comprobante.type === "application/pdf" ? "PDF" : "Imagen"} · {formatoTamano(comprobante.size)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
              <label
                htmlFor={idArchivo}
                className={`rounded-md px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 ${
                  disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                }`}
              >
                Cambiar
              </label>
              <button
                type="button"
                onClick={quitarArchivo}
                disabled={disabled}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:enabled:hover:bg-red-950/40"
              >
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor={idArchivo}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={alSoltar}
            className={`mt-2 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
              disabled
                ? "cursor-not-allowed border-zinc-200 opacity-60 dark:border-zinc-700"
                : arrastrando
                  ? "cursor-copy border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                  : errorArchivo
                    ? "cursor-pointer border-red-300 hover:border-red-400 dark:border-red-800"
                    : "cursor-pointer border-zinc-300 hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-emerald-600 dark:hover:bg-zinc-800/50"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7 text-zinc-400" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {arrastrando ? "Suelta el archivo aquí" : "Adjuntar pantallazo o PDF"}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Haz clic o arrástralo aquí · JPG, PNG, WEBP o PDF · máx. {formatoTamano(TAMANO_MAXIMO_COMPROBANTE)}
            </span>
          </label>
        )}

        {errorArchivo && (
          <p id={`${idArchivo}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errorArchivo}
          </p>
        )}
      </div>
    </section>
  );
}

// Miniatura del comprobante: la imagen en pequeño, o un ícono si es PDF.
// La imagen se lee con FileReader, que la convierte en texto (data URL) que
// el <img> puede mostrar sin subirla a ningún lado.
function VistaPrevia({ archivo }: { archivo: File }) {
  const [imagen, setImagen] = useState<{ archivo: File; url: string } | null>(null);
  const esImagen = archivo.type.startsWith("image/");

  useEffect(() => {
    if (!esImagen) return;
    let vigente = true;
    const lector = new FileReader();
    lector.onload = () => {
      if (vigente && typeof lector.result === "string") setImagen({ archivo, url: lector.result });
    };
    lector.readAsDataURL(archivo);
    return () => {
      vigente = false;
      lector.abort();
    };
  }, [archivo, esImagen]);

  const caja = "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800";

  if (!esImagen) {
    return (
      <div className={`${caja} text-red-600 dark:text-red-400`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          <text x="12" y="17.5" textAnchor="middle" fontSize="5" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
        </svg>
      </div>
    );
  }

  // Mientras se lee (o si cambió el archivo) se deja la caja gris.
  const url = imagen?.archivo === archivo ? imagen.url : null;
  return (
    <div className={caja}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- es un archivo local (data URL), next/image no aplica
        <img src={url} alt="Vista previa del comprobante" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
