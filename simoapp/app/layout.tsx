import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Shell from "@/components/shell/Shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIMO",
  description: "Sistema de gestión de inventarios, ventas y pedidos",
};

// SCRUM-107 (Camilo) — El Shell (Navbar + Sidebar) envuelve toda la app
// desde acá porque todavía no existe página de login (es de otro ticket del
// módulo de Seguridad). Por ahora el Navbar/Sidebar aparecen en todas las
// rutas, incluida "/". Cuando exista login, este <Shell> debería moverse a
// un layout dentro de un route group (ej. app/(app)/layout.tsx) que no
// incluya la ruta de login, para que esa pantalla no tenga Navbar/Sidebar.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
