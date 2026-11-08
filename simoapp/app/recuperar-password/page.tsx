"use client";

// Vista de Recuperación de Contraseña (Solicitud de restablecimiento de clave)
// Maquetación en React + TailwindCSS alineada con el sistema de diseño de SIMO:
// 1. Permite al usuario solicitar un enlace/instrucciones de restablecimiento
//    ingresando su correo corporativo.
// 2. Validación inmediata en cliente (formato de email y campo requerido).
// 3. Manejo de estados de carga (spinner), alerta de error y confirmación visual
//    exitosa (banner verde con instrucciones).
// 4. Enlace directo para regresar al inicio de sesión (/login).

import { useState, type SubmitEvent } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import { Spinner } from "@/components/ui/Spinner";
import { validarRecuperarPassword, type Errores } from "@/lib/auth/validaciones";

export default function RecuperarPasswordPage() {
  const [correo, setCorreo] = useState("");
  const [errores, setErrores] = useState<Errores<"correo">>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoExitoso, setEnviadoExitoso] = useState(false);

  const cambiarCorreo = (valor: string) => {
    setCorreo(valor);
    setErrores({});
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const erroresEncontrados = validarRecuperarPassword(correo);
    setErrores(erroresEncontrados);
    setErrorGeneral("");
    if (Object.keys(erroresEncontrados).length > 0) return;

    setEnviando(true);
    try {
      // Simulación de envío de solicitud al servicio de autenticación
      await new Promise((resolve) => setTimeout(resolve, 800));
      setEnviadoExitoso(true);
    } catch {
      setErrorGeneral("No se pudo enviar la solicitud. Verifica tu conexión o intenta más tarde.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:p-10">
        {/* Cabecera / Logo */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Recuperar Contraseña
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Ingresa tu correo registrado y te enviaremos las instrucciones para restablecer tu clave de acceso.
          </p>
        </div>

        {/* Estado Exitoso: Confirmación de envío */}
        {enviadoExitoso ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div className="flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">¡Solicitud enviada exitosamente!</p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    Hemos enviado un enlace de recuperación a: <strong className="break-all">{correo}</strong>.
                    Revisa tu bandeja de entrada o la carpeta de spam.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/login" className="block w-full">
                <Button className="w-full">
                  Volver al inicio de sesión
                </Button>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setEnviadoExitoso(false);
                  setCorreo("");
                }}
                className="w-full text-center text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
              >
                ¿No recibiste el correo? Intentar con otro email
              </button>
            </div>
          </div>
        ) : (
          /* Formulario de Solicitud */
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {errorGeneral && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {errorGeneral}
              </p>
            )}

            <InputText
              label="Correo electrónico corporativo"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu.nombre@empresa.com"
              required
              disabled={enviando}
              value={correo}
              onChange={(e) => cambiarCorreo(e.target.value)}
              error={errores.correo}
              hint="El correo electrónico vinculado a tu cuenta en el sistema SIMO."
            />

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? (
                <>
                  <Spinner size="sm" color="white" />
                  Enviando instrucciones...
                </>
              ) : (
                "Enviar instrucciones"
              )}
            </Button>

            <div className="pt-2 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Regresar a Iniciar Sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
