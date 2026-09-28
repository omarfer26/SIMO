"use client";

import ProtectedRoute from "@/components/ProtectedRoute";

export default function UsuariosPage() {
  return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Gestión de Usuarios
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Módulo exclusivo para Administradores.
        </p>
      </main>
    </ProtectedRoute>
  );
}
