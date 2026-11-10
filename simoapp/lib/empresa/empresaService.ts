// (Camilo, 2026-11-10) — Puerta única hacia los datos de la empresa (RF-04).
// Antes el Navbar, el ticket del POS y /admin usaban `empresaMock`; ahora
// leen y guardan el registro único de la tabla `empresa`.
//
// CONTRATO (backend/src/routes/empresa.routes.js):
//   GET /api/company  (cualquier usuario con sesión)
//     200 → { empresa: { razon_social, nit, telefono, direccion, logo_url, actualizado_en } }
//   PUT /api/company  (solo ADMIN)
//     Recibe { razon_social, nit, telefono, direccion, logo_url? }
//     200 → { message, empresa }  · 400 dato inválido · 403 sin permiso
//   El cambio queda en la auditoría como ACTUALIZACION_EMPRESA.
//
// El logo todavía no se sube a ningún servidor: solo se manda logo_url si es
// una dirección web (http/https). Una imagen elegida desde el computador
// (blob:) se ve mientras la pestaña esté abierta, pero no se guarda.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { Empresa } from "@/components/shell/tipos";

interface EmpresaApi {
  razon_social: string;
  nit: string;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
}

function aEmpresa(fila: EmpresaApi): Empresa {
  return {
    razonSocial: fila.razon_social,
    nit: fila.nit,
    telefono: fila.telefono ?? "",
    direccion: fila.direccion ?? "",
    logoUrl: fila.logo_url,
  };
}

export async function obtenerEmpresa(): Promise<Empresa> {
  const { data } = await apiClient.get("/company");
  return aEmpresa(data.empresa as EmpresaApi);
}

export async function actualizarEmpresa(datos: Empresa): Promise<Empresa> {
  const logoWeb = datos.logoUrl && /^https?:\/\//i.test(datos.logoUrl) ? datos.logoUrl : undefined;
  const { data } = await apiClient.put("/company", {
    razon_social: datos.razonSocial.trim(),
    nit: datos.nit.trim(),
    telefono: datos.telefono.trim(),
    direccion: datos.direccion.trim(),
    ...(logoWeb !== undefined || datos.logoUrl === null ? { logo_url: logoWeb ?? null } : {}),
  });
  return aEmpresa(data.empresa as EmpresaApi);
}

export function mensajeErrorEmpresa(error: unknown): string {
  if (isAxiosError(error)) {
    if (!error.response) return "No pudimos conectar con el servidor. Los cambios NO se guardaron.";
    const mensaje: unknown = error.response.data?.message;
    if (error.response.status === 400 && typeof mensaje === "string") return mensaje;
  }
  return "El servidor tuvo un problema. Los cambios NO se guardaron; inténtalo de nuevo.";
}
