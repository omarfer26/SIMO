"use client";

// SCRUM-107 (Camilo) — Contenedor dinámico principal de la aplicación:
// junta el Navbar y el Sidebar, y guarda en memoria (useState) dos cosas que
// ambos necesitan compartir: si el cajón del Sidebar está abierto en
// celular, y si el Sidebar está colapsado en escritorio. Se usa una sola vez,
// envolviendo toda la app desde app/layout.tsx.

import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import BannerConexion from "./BannerConexion";
import BannerStockMinimo from "@/components/notificaciones/BannerStockMinimo";

// SCRUM-160 (Camilo) — Por debajo de 1280 px (tablet en horizontal o laptop
// chica) el menú arranca colapsado en íconos, para dejarle espacio al POS y a
// las tablas. El usuario lo puede expandir con la flecha; solo se vuelve a
// colapsar o expandir solo si la ventana cruza los 1280 px.
const CONSULTA_PANTALLA_ANGOSTA = "(max-width: 1279px)";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarAbiertoEnMobile, setSidebarAbiertoEnMobile] = useState(false);
  const [sidebarColapsado, setSidebarColapsado] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_PANTALLA_ANGOSTA);
    const aplicar = () => setSidebarColapsado(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

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
        {/* SCRUM-122 (Camilo) — Banner de conexión arriba del contenido, no
            encima del Sidebar, para no tapar el menú al hacer scroll. */}
        <main className="min-w-0 flex-1">
          <BannerConexion />
          {/* Centro de notificaciones — Resumen fijo de las reposiciones
              pendientes. Va debajo del banner de conexión y no es sticky, para
              que los dos no se pisen el mismo top-14. */}
          <BannerStockMinimo />
          {children}
        </main>
      </div>
    </div>
  );
}
