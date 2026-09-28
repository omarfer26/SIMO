"use client";

// SCRUM-107 (Camilo) — Contenedor dinámico principal de la aplicación:
// junta el Navbar y el Sidebar, y guarda en memoria (useState) dos cosas que
// ambos necesitan compartir: si el cajón del Sidebar está abierto en
// celular, y si el Sidebar está colapsado en escritorio. Se usa una sola vez,
// envolviendo toda la app desde app/layout.tsx.

import { useState } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarAbiertoEnMobile, setSidebarAbiertoEnMobile] = useState(false);
  const [sidebarColapsado, setSidebarColapsado] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAbrirSidebarMobile={() => setSidebarAbiertoEnMobile(true)}
      />
      <div className="flex flex-1">
        <Sidebar
          abiertoEnMobile={sidebarAbiertoEnMobile}
          colapsado={sidebarColapsado}
          onCerrarEnMobile={() => setSidebarAbiertoEnMobile(false)}
          onAlternarColapsado={() => setSidebarColapsado((valor) => !valor)}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
