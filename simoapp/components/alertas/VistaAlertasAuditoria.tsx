"use client";

// HU-15 — Contenedor con pestañas del módulo "Alertas y Auditoría" (/alertas):
// "Log de Auditoría" (PanelAuditoria) y "Reportes" (la consola de descargas
// PDF/Excel/Word, reutilizada de components/reportes). Las alertas de stock
// siguen en la campana de notificaciones; acá no se duplican.

import { useState, type ReactNode } from "react";
import PanelAuditoria from "@/components/auditoria/PanelAuditoria";
import ConsolaDescargasReportes from "@/components/reportes/ConsolaDescargasReportes";

type Pestana = "auditoria" | "reportes";

export default function VistaAlertasAuditoria() {
  const [pestana, setPestana] = useState<Pestana>("auditoria");

  return (
    <div className="space-y-6">
      <div
        className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800"
        role="tablist"
        aria-label="Secciones de Alertas y Auditoría"
      >
        <BotonPestana
          activa={pestana === "auditoria"}
          onClick={() => setPestana("auditoria")}
          icono="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        >
          Log de Auditoría
        </BotonPestana>
        <BotonPestana
          activa={pestana === "reportes"}
          onClick={() => setPestana("reportes")}
          icono="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        >
          Reportes
        </BotonPestana>
      </div>

      {/* Se monta solo la pestaña activa; cada una carga lo suyo al entrar. */}
      {pestana === "auditoria" ? <PanelAuditoria /> : <ConsolaDescargasReportes />}
    </div>
  );
}

function BotonPestana({
  activa,
  onClick,
  icono,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  icono: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
        activa
          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icono} />
      </svg>
      {children}
    </button>
  );
}
