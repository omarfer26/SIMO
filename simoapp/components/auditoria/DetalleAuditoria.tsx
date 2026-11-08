"use client";

// HU-15 — Detalle de un registro del log de auditoría (presentación). Es de
// SOLO LECTURA: muestra quién, cuándo, qué cambió (antes/después), la
// justificación y la IP. No hay botones de editar ni borrar porque la bitácora
// es inalterable (la base bloquea UPDATE/DELETE con triggers, RF-24).

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { NOMBRES_ACCION, type EntradaAuditoria, type Snapshot } from "@/lib/auditoria/tipos";
import { formatoFechaHoraAuditoria, formatoValorSnapshot } from "@/lib/auditoria/formato";
import { VARIANTE_ACCION } from "./estilos";

interface Props {
  /** Registro a mostrar, o null para mantener el modal cerrado. */
  entrada: EntradaAuditoria | null;
  onCerrar: () => void;
}

export default function DetalleAuditoria({ entrada, onCerrar }: Props) {
  return (
    <Modal
      isOpen={entrada !== null}
      onClose={onCerrar}
      maxWidth="2xl"
      title={entrada ? `Registro de auditoría #${entrada.idLog}` : ""}
      footer={
        <Button type="button" variant="secondary" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {entrada && <Cuerpo entrada={entrada} />}
    </Modal>
  );
}

function Cuerpo({ entrada }: { entrada: EntradaAuditoria }) {
  return (
    <div className="space-y-5">
      {/* Aviso de inalterabilidad (contexto para el Administrador). */}
      <p className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        Registro inalterable: no se puede editar ni eliminar. Solo lectura para
        supervisión.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANTE_ACCION[entrada.accion]}>
          {NOMBRES_ACCION[entrada.accion]}
        </Badge>
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {entrada.entidad} #{entrada.idEntidad}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha y hora" valor={formatoFechaHoraAuditoria(entrada.fecha)} />
        <Campo etiqueta="Usuario" valor={entrada.usuario} />
        <Campo
          etiqueta="Autorizó"
          valor={entrada.autorizador ?? "No aplica"}
          atenuado={entrada.autorizador === null}
        />
        <Campo etiqueta="Dirección IP" valor={entrada.direccionIp ?? "—"} mono />
      </dl>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Justificación
        </p>
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            entrada.justificacion
              ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
              : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
          }`}
        >
          {entrada.justificacion ?? "No registrada para esta acción."}
        </p>
      </div>

      {/* Antes / después: la foto de lo que cambió (JSONB en la base). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PanelDatos titulo="Antes" datos={entrada.datosAnteriores} />
        <PanelDatos titulo="Después" datos={entrada.datosNuevos} />
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  mono,
  atenuado,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  atenuado?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {etiqueta}
      </dt>
      <dd
        className={`mt-0.5 text-sm ${mono ? "font-mono" : ""} ${
          atenuado ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function PanelDatos({ titulo, datos }: { titulo: string; datos: Snapshot }) {
  const tieneDatos = datos !== null && Object.keys(datos).length > 0;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <p className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
        {titulo}
      </p>
      {tieneDatos ? (
        <dl className="divide-y divide-zinc-100 px-3 py-1 dark:divide-zinc-800">
          {Object.entries(datos as Record<string, unknown>).map(([campo, valor]) => (
            <div key={campo} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{campo}</dt>
              <dd className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                {formatoValorSnapshot(valor)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
          Sin datos registrados.
        </p>
      )}
    </div>
  );
}
