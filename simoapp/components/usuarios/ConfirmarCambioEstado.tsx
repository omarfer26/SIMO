"use client";

// SCRUM-21 (Camilo) — Contenido del modal que confirma si se activa o se
// desactiva un usuario. Explica en palabras simples qué va a pasar (un
// usuario inactivo no puede iniciar sesión, pero no se borra nada) y, al
// confirmar, llama a cambiarEstadoUsuario. Mientras espera la respuesta los
// botones quedan bloqueados para no mandar el cambio dos veces; si falla,
// muestra el error y deja reintentar.
//
// El botón es rojo (danger) al desactivar, porque le quita el acceso a
// alguien, y verde (primary) al activar.

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cambiarEstadoUsuario, mensajeDeError } from "@/lib/auth/authService";
import type { UsuarioListado } from "@/lib/auth/tipos";

interface ConfirmarCambioEstadoProps {
  usuario: UsuarioListado;
  onCambiado: (usuario: UsuarioListado) => void;
  onCancelar: () => void;
}

export default function ConfirmarCambioEstado({
  usuario,
  onCambiado,
  onCancelar,
}: ConfirmarCambioEstadoProps) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const desactivar = usuario.activo;

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      onCambiado(await cambiarEstadoUsuario(usuario.id, !desactivar));
    } catch (e) {
      setError(mensajeDeError(e));
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          ¿Seguro que quieres {desactivar ? "desactivar" : "activar"} a{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {usuario.nombreCompleto}
          </strong>{" "}
          ({usuario.correo})?
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">
          {desactivar
            ? "No podrá iniciar sesión hasta que lo vuelvas a activar. No se borra nada: sus datos y su historial se conservan."
            : "Podrá volver a iniciar sesión con su correo y su contraseña de siempre."}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          variant={desactivar ? "danger" : "primary"}
          onClick={confirmar}
          disabled={enviando}
        >
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              {desactivar ? "Desactivando..." : "Activando..."}
            </>
          ) : desactivar ? (
            "Sí, desactivar"
          ) : (
            "Sí, activar"
          )}
        </Button>
      </div>
    </div>
  );
}
