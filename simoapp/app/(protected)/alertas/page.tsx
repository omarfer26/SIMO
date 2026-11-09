import VistaAlertasAuditoria from "@/components/alertas/VistaAlertasAuditoria";

// HU-15 — Módulo "Alertas y Auditoría". Página delgada (Server Component, como
// /kardex): encabezado + contenedor con pestañas (Alertas de stock | Log de
// Auditoría | Reportes).
// EP-05 — Entran ADMIN, GERENTE e INVENTARIO: el Inventario solo ve las
// alertas de stock; Auditoría y Reportes son del Administrador y del Gerente
// (los filtra VistaAlertasAuditoria.tsx). El Vendedor lo redirige
// middleware.ts.
export default function AlertasPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Alertas y Auditoría
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Revisa los productos que requieren reposición, consulta el log de
          auditoría inalterable (cancelaciones y ajustes manuales de
          existencias) y descarga reportes en Excel, PDF o Word.
        </p>
      </div>
      <VistaAlertasAuditoria />
    </main>
  );
}
