"use client";

// SCRUM-loginMejora (Camilo) — Se agregó el botón "Crear usuario", que abre el
// formulario de registro (components/usuarios/FormularioUsuario.tsx) dentro
// del Modal, y el aviso verde cuando el usuario queda creado. También se
// quitó el envoltorio <ProtectedRoute>: ese archivo se borró del proyecto y
// la página no compilaba. La protección "solo ADMIN" de esta ruta ya la hace
// middleware.ts.

import { useState } from "react";
import FormularioUsuario from "@/components/usuarios/FormularioUsuario";
import Button from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import type { UsuarioCreado } from "@/lib/auth/tipos";

export default function UsuariosPage() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioCreado, setUsuarioCreado] = useState<UsuarioCreado | null>(null);

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Gestión de Usuarios
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Módulo exclusivo para Administradores.
            </p>
          </div>
          <Button
            onClick={() => {
              setUsuarioCreado(null);
              setModalAbierto(true);
            }}
          >
            Crear usuario
          </Button>
        </div>

        {usuarioCreado && (
          <p
            role="status"
            className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          >
            Usuario <strong>{usuarioCreado.nombreCompleto}</strong> creado. Ya
            puede iniciar sesión con el correo{" "}
            <strong>{usuarioCreado.correo}</strong>.
          </p>
        )}

        {/* Ejemplo de uso del Skeleton para simular una tabla cargando */}
        <div className="mt-8">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-50 dark:bg-zinc-900 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-4 gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-6 py-4 grid grid-cols-4 gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circular" className="h-8 w-8" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* El formulario solo existe mientras el modal está abierto: así cada
          vez que se abre arranca con los campos vacíos. */}
      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Crear usuario"
        maxWidth="xl"
        closeOnBackdropClick={false}
      >
        {modalAbierto && (
          <FormularioUsuario
            onCancelar={() => setModalAbierto(false)}
            onCreado={(usuario) => {
              setUsuarioCreado(usuario);
              setModalAbierto(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}
