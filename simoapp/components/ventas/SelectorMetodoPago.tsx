"use client";

// SCRUM-59 (Camilo) — Los 6 métodos de pago (Efectivo, Nequi, Daviplata...)
// como tarjetas para elegir uno. Antes vivía dentro de ConfirmarVenta.tsx
// (SCRUM-50); se sacó a su propio archivo porque ahora también lo usa
// "Convertir en venta" en /pedidos. Son radios de verdad (accesibles con
// teclado y lector de pantalla), con el círculo escondido y la tarjeta entera
// como zona para hacer clic.

import { METODOS_PAGO, type CodigoMetodoPago } from "@/lib/ventas/tipos";

interface SelectorMetodoPagoProps {
  valor: CodigoMetodoPago | null;
  onCambiar: (codigo: CodigoMetodoPago) => void;
  disabled?: boolean;
  error?: string;
}

export default function SelectorMetodoPago({
  valor,
  onCambiar,
  disabled = false,
  error,
}: SelectorMetodoPagoProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Método de pago <span className="text-red-500">*</span>
      </legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {METODOS_PAGO.map((metodo) => {
          const elegido = valor === metodo.codigo;
          return (
            <label
              key={metodo.codigo}
              className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
                elegido
                  ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                  : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
              }`}
            >
              <input
                type="radio"
                name="metodoPago"
                value={metodo.codigo}
                checked={elegido}
                onChange={() => onCambiar(metodo.codigo)}
                className="sr-only"
              />
              <span
                className={`block text-sm font-medium ${
                  elegido
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {metodo.nombre}
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {metodo.descripcion}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {valor && valor !== "EFECTIVO" && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Verifica que el pago haya llegado antes de confirmar: el sistema solo
          registra el método, no se conecta con el banco ni con la app.
        </p>
      )}
    </fieldset>
  );
}
