"use client";

// (Camilo, 2026-11-10) — Datos de la empresa compartidos por el Navbar, el
// ticket del POS y la página /admin. Se piden una sola vez al backend
// (GET /api/company) al entrar a la app; cuando /admin guarda cambios, todos
// los que leen este contexto se actualizan al instante (antes cada uno tenía
// su propia copia de `empresaMock`).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { actualizarEmpresa, obtenerEmpresa } from "@/lib/empresa/empresaService";
import type { Empresa } from "./tipos";

type EstadoEmpresa = "cargando" | "listo" | "error";

interface EmpresaContextValue {
  /** null mientras carga o si el backend no respondió. */
  empresa: Empresa | null;
  estado: EstadoEmpresa;
  /** Guarda en el backend; lanza el error para que el formulario lo muestre. */
  guardarEmpresa: (datos: Empresa) => Promise<void>;
  recargarEmpresa: () => Promise<void>;
}

const EmpresaContext = createContext<EmpresaContextValue | null>(null);

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [estado, setEstado] = useState<EstadoEmpresa>("cargando");

  async function recargarEmpresa() {
    setEstado("cargando");
    try {
      setEmpresa(await obtenerEmpresa());
      setEstado("listo");
    } catch (error) {
      console.error("No se pudieron cargar los datos de la empresa", error);
      setEstado("error");
    }
  }

  useEffect(() => {
    let vigente = true;
    obtenerEmpresa()
      .then((datos) => {
        if (!vigente) return;
        setEmpresa(datos);
        setEstado("listo");
      })
      .catch((error) => {
        if (!vigente) return;
        console.error("No se pudieron cargar los datos de la empresa", error);
        setEstado("error");
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function guardarEmpresa(datos: Empresa) {
    const guardada = await actualizarEmpresa(datos);
    // El logo elegido desde el computador (blob:) no se sube todavía: se
    // conserva en pantalla mientras la pestaña siga abierta.
    setEmpresa({ ...guardada, logoUrl: guardada.logoUrl ?? datos.logoUrl });
    setEstado("listo");
  }

  return (
    <EmpresaContext.Provider value={{ empresa, estado, guardarEmpresa, recargarEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa(): EmpresaContextValue {
  const contexto = useContext(EmpresaContext);
  if (!contexto) throw new Error("useEmpresa debe usarse dentro de <EmpresaProvider>.");
  return contexto;
}
