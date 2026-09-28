// SCRUM-107 (Camilo) — Lista de módulos que se muestran en el Sidebar,
// según el alcance funcional definido en CLAUDE.md. Solo "Catálogo e
// Inventario" tiene página real hoy (/catalogo); las demás rutas son
// placeholders para que el link ya quede listo cuando otro ticket construya
// esa página (mientras tanto, esos links dan 404, lo cual es esperado).

import type { ModuloNav } from "./tipos";

function Icono({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

export const modulos: ModuloNav[] = [
  {
    nombre: "Dashboard",
    href: "/",
    icono: (
      <Icono d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    ),
  },
  {
    nombre: "Catálogo e Inventario",
    href: "/catalogo",
    icono: (
      <Icono d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    ),
  },
  {
    nombre: "Ventas",
    href: "/ventas",
    icono: (
      <Icono d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.907-4.807 2.309-7.4a.75.75 0 00-.738-.866H5.106M7.5 14.25L5.106 5.272M6 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    ),
  },
  {
    nombre: "Pedidos",
    href: "/pedidos",
    icono: (
      <Icono d="M9 12h3.75M9 15h3.75M9 18h3.75M8.25 8.25h7.5M8.25 4.875c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V6a.75.75 0 01-.75.75h-6a.75.75 0 01-.75-.75V4.875zM5.625 6H4.875c-.621 0-1.125.504-1.125 1.125v13.5c0 .621.504 1.125 1.125 1.125h14.25c.621 0 1.125-.504 1.125-1.125V7.125C20.25 6.504 19.746 6 19.125 6h-.75" />
    ),
  },
  {
    nombre: "Alertas y Auditoría",
    href: "/alertas",
    icono: (
      <Icono d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    ),
  },
  {
    nombre: "Administración",
    href: "/admin",
    icono: (
      <Icono d="M4.5 19.5v-15m0 15h15m-15 0v-6a1.5 1.5 0 011.5-1.5h3v7.5m-4.5 0h4.5m0 0v-9a1.5 1.5 0 011.5-1.5h3v10.5m0 0h4.5v-4.5a1.5 1.5 0 00-1.5-1.5H15" />
    ),
  },
];
