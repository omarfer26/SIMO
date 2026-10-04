"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Skeleton } from "@/components/ui/Skeleton";

export default function UsuariosPage() {
  return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
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
          <div className="flex gap-2">
             <Skeleton className="h-10 w-24" />
             <Skeleton className="h-10 w-32" />
          </div>
        </div>

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
    </ProtectedRoute>
  );
}
