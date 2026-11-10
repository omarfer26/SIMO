"use client";

// SCRUM-111 (Camilo) — Página nueva en la ruta /admin (el link "Administración"
// del Sidebar ya apuntaba acá desde SCRUM-107, pero todavía no existía la
// página). Es la "Vista" de los parámetros de la empresa: muestra los datos
// actuales en modo lectura y, con el botón "Editar datos", abre el
// formulario modal (FormularioEmpresa) para cambiarlos.
//
// (Camilo, 2026-11-10) — Los datos ya no son `empresaMock`: salen de la base
// (GET /api/company, vía EmpresaContext) y "Guardar cambios" hace PUT
// /api/company. Como el contexto es compartido, el Navbar y el ticket del
// POS muestran el cambio al instante.

import { useState } from "react";
import FormularioEmpresa from "@/components/admin/FormularioEmpresa";
import { useEmpresa } from "@/components/shell/EmpresaContext";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Empresa } from "@/components/shell/tipos";

export default function AdminPage() {
  const { empresa, estado, guardarEmpresa: guardarEnServidor, recargarEmpresa } = useEmpresa();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  async function guardarEmpresa(datos: Empresa) {
    await guardarEnServidor(datos);
    setMostrarConfirmacion(true);
    setTimeout(() => setMostrarConfirmacion(false), 3000);
  }

  if (!empresa) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Datos de la empresa
        </h1>
        {estado === "error" ? (
          <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <span>No pudimos traer los datos de la empresa desde el servidor.</span>
            <Button variant="secondary" onClick={recargarEmpresa}>Reintentar</Button>
          </div>
        ) : (
          <Skeleton className="mt-6 h-48" />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Datos de la empresa
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Información general de la empresa que se muestra en el sistema.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Editar datos
        </button>
      </div>

      {mostrarConfirmacion && (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          Datos de la empresa actualizados correctamente.
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          {empresa.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- puede ser un blob: local, next/image no lo optimiza
            <img
              src={empresa.logoUrl}
              alt="Logo de la empresa"
              className="h-16 w-16 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-100 text-xl font-bold text-zinc-400 dark:bg-zinc-800">
              {empresa.razonSocial.charAt(0)}
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Razón social
            </dt>
            <dd className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {empresa.razonSocial}
            </dd>
          </div>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            NIT
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {empresa.nit}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Teléfono
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {empresa.telefono}
          </dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Dirección
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {empresa.direccion}
          </dd>
        </div>
      </dl>

      {modalAbierto && (
        <FormularioEmpresa
          empresa={empresa}
          onCerrar={() => setModalAbierto(false)}
          onGuardar={guardarEmpresa}
        />
      )}
    </main>
  );
}
