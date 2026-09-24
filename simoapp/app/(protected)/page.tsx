// SCRUM-107 (Camilo) — Home provisional. Reemplaza la plantilla por defecto
// de create-next-app (logos de Vercel/Next.js) que quedaba rara dentro del
// Shell nuevo. El dashboard gerencial real (ventas, alertas, etc.) es otro
// ticket del módulo de Alertas y Auditoría.
// Arreglo (Camilo) — Se movió de app/page.tsx a app/(protected)/page.tsx:
// había quedado fuera del grupo (protected) cuando el Shell pasó a ese
// layout, así que el link "Dashboard" del Sidebar llevaba a una página sin
// menú y sin pedir login. La URL sigue siendo "/" (los paréntesis del grupo
// no cuentan en la dirección).
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Bienvenido a SIMO
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Usa el menú lateral para navegar entre los módulos del sistema.
      </p>
    </main>
  );
}
