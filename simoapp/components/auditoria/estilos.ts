// HU-15 — Presentación compartida del log de auditoría. El color de la insignia
// por tipo de acción es presentación (no datos), por eso vive en components y
// no en lib. Las acciones críticas (ajustes y cancelaciones) usan colores de
// aviso/peligro para que el Administrador las distinga de un vistazo.

import type { BadgeVariant } from "@/components/ui/Badge";
import type { AccionAuditoria } from "@/lib/auditoria/tipos";

export const VARIANTE_ACCION: Record<AccionAuditoria, BadgeVariant> = {
  AJUSTE_INVENTARIO: "warning",
  ANULACION_VENTA: "danger",
  CANCELACION_PEDIDO: "danger",
  CAMBIO_PRECIO: "info",
  CAMBIO_ROL_USUARIO: "primary",
  CAMBIO_ESTADO_USUARIO: "primary",
  ACTUALIZACION_EMPRESA: "default",
};
