"use client";

// SCRUM-loginMejora (Camilo) — Pantalla de inicio de sesión. Antes cualquier clic en
// "Ingresar" dejaba entrar como ADMIN sin revisar nada. Ahora:
//  1. Valida correo y contraseña en el navegador (lib/auth/validaciones.ts)
//     y muestra el error debajo de cada campo.
//  2. Envía las credenciales por lib/auth/authService.ts (API real o mock).
//  3. Si el backend responde con error, muestra un mensaje general arriba
//     del formulario (credenciales incorrectas, cuenta inactiva, servidor
//     caído...).
//  4. Mientras espera la respuesta, bloquea los campos y el botón para que
//     no se envíe dos veces.

import { useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import { Spinner } from "@/components/ui/Spinner";
import { iniciarSesion, mensajeDeError } from "@/lib/auth/authService";
import { guardarSesion } from "@/lib/auth/sesion";
import type { CredencialesLogin } from "@/lib/auth/tipos";
import { validarLogin, type Errores } from "@/lib/auth/validaciones";

export default function LoginPage() {
  const [datos, setDatos] = useState<CredencialesLogin>({ correo: "", password: "" });
  const [errores, setErrores] = useState<Errores<keyof CredencialesLogin>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Al corregir un campo se borra su mensaje de error (y el general), para
  // que el usuario no siga viendo un error que ya está arreglando.
  const cambiar = (campo: keyof CredencialesLogin, valor: string) => {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const erroresEncontrados = validarLogin(datos);
    setErrores(erroresEncontrados);
    setErrorGeneral("");
    if (Object.keys(erroresEncontrados).length > 0) return;

    setEnviando(true);
    try {
      const sesion = await iniciarSesion(datos);
      guardarSesion(sesion);
      // Usamos window.location.href en lugar de router.push(): fuerza una
      // petición real al servidor para que middleware.ts vea la cookie nueva.
      // No se apaga `enviando`: el botón sigue bloqueado hasta que cambia la
      // página.
      window.location.href = "/";
    } catch (error) {
      setErrorGeneral(mensajeDeError(error));
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:p-10">
        <div>
          <h1 className="text-center text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            SIMO
          </h1>
          <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Por favor inicia sesión con tu cuenta
          </p>
        </div>

        {/* noValidate apaga los globos de error del navegador para mostrar
            los nuestros, debajo de cada campo y en español. */}
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
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nombre@empresa.com"
            required
            disabled={enviando}
            value={datos.correo}
            onChange={(e) => cambiar("correo", e.target.value)}
            error={errores.correo}
          />
          <InputText
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={enviando}
            value={datos.password}
            onChange={(e) => cambiar("password", e.target.value)}
            error={errores.password}
          />

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? (
              <>
                <Spinner size="sm" color="white" />
                Ingresando...
              </>
            ) : (
              "Ingresar"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
