"use client";

// Guía interactiva de atajos de teclado para el cajero (F1)
// Muestra una ventana flotante modal accesible con las combinaciones de teclas
// para operar la caja rápidamente sin necesidad de ratón.

import { Modal } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface ModalAtajosTecladoProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Atajo {
  tecla: string;
  descripcion: string;
  categoria: "Navegación y Ayuda" | "Operación de Venta" | "Control de Canasta";
}

const ATAJOS: Atajo[] = [
  // Navegación y Ayuda
  {
    tecla: "F1",
    descripcion: "Abrir / Cerrar esta guía interactiva de atajos",
    categoria: "Navegación y Ayuda",
  },
  {
    tecla: "Esc",
    descripcion: "Cerrar modal abierto, limpiar buscador o cancelar acción",
    categoria: "Navegación y Ayuda",
  },
  {
    tecla: "F3",
    descripcion: "Enfocar el buscador predictivo de productos / código de barras",
    categoria: "Operación de Venta",
  },
  {
    tecla: "F2",
    descripcion: "Buscar o asociar cliente a la venta (por Cédula / NIT)",
    categoria: "Operación de Venta",
  },
  {
    tecla: "F4",
    descripcion: "Proceder al cobro y Confirmar Venta (F4 o F9)",
    categoria: "Operación de Venta",
  },
  {
    tecla: "F8",
    descripcion: "Acceso rápido a Anular la última venta registrada",
    categoria: "Operación de Venta",
  },
  {
    tecla: "Enter",
    descripcion: "En buscador: agregar producto o procesar código de barras escaneado",
    categoria: "Control de Canasta",
  },
  {
    tecla: "Supr / Del",
    descripcion: "Vaciar la canasta de compras actual (con confirmación)",
    categoria: "Control de Canasta",
  },
];

export default function ModalAtajosTeclado({
  isOpen,
  onClose,
}: ModalAtajosTecladoProps) {
  const categorias = ["Operación de Venta", "Control de Canasta", "Navegación y Ayuda"] as const;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 font-mono text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            F1
          </span>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Guía de Atajos de Teclado POS
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Comandos rápidos para agilizar la atención en caja sin usar el ratón
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Presiona <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Esc</kbd> o <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">F1</kbd> para salir
          </p>
          <Button variant="primary" onClick={onClose} className="text-xs">
            Entendido
          </Button>
        </div>
      }
    >
      <div className="space-y-5 py-1">
        {categorias.map((cat) => {
          const atajosCategoria = ATAJOS.filter((a) => a.categoria === cat);
          return (
            <div key={cat} className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {cat}
              </h4>
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900">
                {atajosCategoria.map((atajo) => (
                  <div
                    key={atajo.tecla}
                    className="flex items-center justify-between px-3.5 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {atajo.descripcion}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-4">
                      {atajo.tecla.split(" / ").map((teclaIndividual) => (
                        <kbd
                          key={teclaIndividual}
                          className="inline-flex min-w-[28px] items-center justify-center rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 font-mono text-xs font-bold text-zinc-800 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          {teclaIndividual}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Consejo para cajeros */}
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          <svg className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold">Consejo de agilidad:</p>
            <p className="mt-0.5 text-emerald-800 dark:text-emerald-400">
              Con el lector de código de barras USB conectado, no requieres presionar ningún atajo: escanea directamente el producto y entrará de inmediato a la canasta.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
