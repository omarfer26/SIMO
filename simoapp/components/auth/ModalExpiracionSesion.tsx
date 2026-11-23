"use client";

// Modal emergente para manejo pasivo de expiración de sesión JWT (30 minutos)
// Permite al cajero, vendedor o administrador re-autenticarse rápidamente
// sin perder el formulario, canasta o datos en pantalla.

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { iniciarSesion, mensajeDeError } from "@/lib/auth/authService";
import {
  cerrarSesion,
  guardarSesion,
  leerCorreoUsuario,
  obtenerExpiracionToken,
} from "@/lib/auth/sesion";
import {
  notificarSesionRecuperada,
  suscribirExpiracionSesion,
} from "@/lib/auth/gestorExpiracion";

export default function ModalExpiracionSesion() {
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const correoActual = leerCorreoUsuario() || "usuario@empresa.com";

  // 1. Escuchar notificaciones pasivas de 401 desde el interceptor de Axios
  useEffect(() => {
    const desuscribir = suscribirExpiracionSesion(() => {
      setAbierto(true);
      setError("");
    });
    return desuscribir;
  }, []);

  // 2. Monitoreo pasivo preventivo del tiempo de expiración del JWT (30 min)
  useEffect(() => {
    const verificarTiempo = () => {
      const expMs = obtenerExpiracionToken();
      if (!expMs) return;

      const ahora = Date.now();
      const difMs = expMs - ahora;

      if (difMs <= 0) {
        // Token vencido
        setAbierto(true);
      }
    };

    verificarTiempo();
    const intervalo = setInterval(verificarTiempo, 15000); // Comprobar cada 15 seg
    return () => clearInterval(intervalo);
  }, []);

  async function reautenticar(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || enviando) return;

    setEnviando(true);
    setError("");

    try {
      const sesionNueva = await iniciarSesion({
        correo: correoActual,
        password: password.trim(),
      });

      guardarSesion(sesionNueva);
      setAbierto(false);
      setPassword("");
      setError("");

      // Notificar que la sesión se recuperó para reintentar peticiones pendientes
      notificarSesionRecuperada();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  function salirAlLogin() {
    cerrarSesion();
    window.location.href = "/login";
  }

  if (!abierto) return null;

  return (
    <Modal
      isOpen={abierto}
      onClose={() => {}} // No se puede cerrar con clic afuera o ESC para proteger la integridad
      closeOnBackdropClick={false}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Tu sesión ha expirado
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          Por seguridad institucional (límite de 30 minutos), tu sesión se ha pausado.
          <strong className="block mt-1 font-semibold text-zinc-800 dark:text-zinc-200">
            ¡No te preocupes! Los datos de tu pantalla, carrito o formulario no se han perdido.
          </strong>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <form onSubmit={reautenticar} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Usuario en sesión
            </label>
            <div className="mt-1 flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <span>{correoActual}</span>
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                Bloqueado temporalmente
              </span>
            </div>
          </div>

          <InputText
            id="passwordExpiracion"
            label="Contraseña"
            type="password"
            autoFocus
            required
            placeholder="Ingresa tu contraseña para reanudar"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={enviando}
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={salirAlLogin}
              disabled={enviando}
              className="text-xs"
            >
              Cerrar sesión e ir al inicio
            </Button>

            <Button type="submit" disabled={enviando || !password.trim()}>
              {enviando ? (
                <>
                  <Spinner size="sm" color="white" />
                  <span>Verificando…</span>
                </>
              ) : (
                "Reanudar sesión"
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
