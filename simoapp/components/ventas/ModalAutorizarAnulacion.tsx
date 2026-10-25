"use client";

// Componente modal para solicitar credenciales de Gerente o Administrador
// antes de autorizar la anulación de una venta.
// Cumple con la regla de negocio: solo GERENTE o ADMIN pueden autorizar.

import { useState } from "react";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import { Modal } from "@/components/ui/Modal";
import { anularVenta, ErrorAnulacion } from "@/lib/ventas/anulacionService";
import type { ResultadoAnulacion, VentaHistorial } from "@/lib/ventas/tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface ModalAutorizarAnulacionProps {
  venta: VentaHistorial | null;
  isOpen: boolean;
  onClose: () => void;
  onAnulacionExitosa: (resultado: ResultadoAnulacion, ventaAnulada: VentaHistorial) => void;
}

export default function ModalAutorizarAnulacion({
  venta,
  isOpen,
  onClose,
  onAnulacionExitosa,
}: ModalAutorizarAnulacionProps) {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  if (!venta) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidacion(null);

    const emailTrim = correo.trim();
    if (!emailTrim || !password) {
      setErrorValidacion("Por favor ingrese el correo y contraseña del usuario autorizador.");
      return;
    }

    if (motivo.trim().length < 5) {
      setErrorValidacion("El motivo de anulación debe tener al menos 5 caracteres descriptivos.");
      return;
    }

    setProcesando(true);
    try {
      const resultado = await anularVenta({
        idVenta: venta.idVenta,
        motivo: motivo.trim(),
        credenciales: {
          correo: emailTrim,
          password,
        },
      });

      // Limpiar y notificar éxito
      setCorreo("");
      setPassword("");
      setMotivo("");
      onAnulacionExitosa(resultado, venta);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ErrorAnulacion) {
        setErrorValidacion(err.message);
      } else if (err instanceof Error) {
        setErrorValidacion(err.message);
      } else {
        setErrorValidacion("Error desconocido al autorizar la anulación.");
      }
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!procesando) {
          setErrorValidacion(null);
          onClose();
        }
      }}
      title="Autorización Gerencial Requerida"
      maxWidth="md"
      closeOnBackdropClick={!procesando}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner de Advertencia */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <svg
            className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-xs sm:text-sm">
            <span className="font-semibold">Acción Crítica y Auditada: </span>
            La anulación de una venta cancela la transacción comercial y restituye los productos al inventario.
            Solo personal con rol <strong>GERENTE</strong> o <strong>ADMINISTRADOR</strong> puede autorizarla.
          </div>
        </div>

        {/* Resumen de la Venta a Anular */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40 text-sm space-y-1.5">
          <div className="flex justify-between items-center font-medium">
            <span className="text-zinc-600 dark:text-zinc-400">Venta:</span>
            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">#{venta.idVenta}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-600 dark:text-zinc-400">Total:</span>
            <span className="font-bold text-red-600 dark:text-red-400">
              {formatoMoneda.format(venta.total)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400">
            <span>Cliente:</span>
            <span>{venta.cliente?.nombre || "Consumidor Final"}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400">
            <span>Método de pago:</span>
            <span className="font-medium uppercase">{venta.metodoPago}</span>
          </div>
          <div className="mt-2 border-t border-zinc-200 dark:border-zinc-700/60 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Artículos a restituir al inventario: </span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {venta.items.map((it) => `${it.cantidad}x ${it.nombreProducto}`).join(", ")}
            </span>
          </div>
        </div>

        {/* Motivo de Anulación */}
        <div>
          <label
            htmlFor="motivo-anulacion"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Motivo / Justificación de la anulación <span className="text-red-500">*</span>
          </label>
          <textarea
            id="motivo-anulacion"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Devolución inmediata por cliente insatisfecho, error en digitación de cantidad o medio de pago..."
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            required
            disabled={procesando}
          />
        </div>

        {/* Formulario de Credenciales Gerenciales */}
        <div className="space-y-3 rounded-lg border border-zinc-200 p-3.5 dark:border-zinc-800">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <svg
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
            Credenciales de Usuario Autorizador (Gerente o Admin)
          </p>

          <InputText
            label="Correo electrónico autorizador"
            type="email"
            placeholder="gerente@simo.local o admin@simo.local"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            disabled={procesando}
            required
          />

          <InputText
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={procesando}
            required
          />
        </div>

        {/* Feedback de Error */}
        {errorValidacion && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-3 text-xs sm:text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 flex items-center gap-2"
          >
            <svg className="h-5 w-5 shrink-0 text-red-600" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorValidacion}</span>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={procesando}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={procesando}
            className="flex items-center gap-2"
          >
            {procesando ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Verificando y Anulando...</span>
              </>
            ) : (
              <span>Autorizar y Anular Venta</span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
