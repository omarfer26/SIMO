// SCRUM-154 (Camilo) — Página 404 dentro del Shell. Next.js la muestra
// cuando una página de este grupo llama a notFound(), y también para
// cualquier dirección que no existe, gracias a [...ruta]/page.tsx. Como vive
// dentro de app/(protected), el Navbar y el Sidebar siguen visibles.
import PantallaError from "@/components/errores/PantallaError";

export default function NoEncontrado() {
  return (
    <PantallaError
      codigo="404"
      titulo="No encontramos esta página"
      mensaje="Puede que la dirección esté mal escrita o que la página ya no exista. Usa el menú para ir a otro módulo o vuelve al inicio."
    />
  );
}
