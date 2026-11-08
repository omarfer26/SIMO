"use client";

// SCRUM-122 (Camilo) — Banner de estado de la conexión, arriba del contenido
// de todas las páginas protegidas (se monta una sola vez en Shell.tsx).
//  - Sin conexión: barra roja "Sin conexión a internet" que se queda hasta
//    que la red vuelva. Solo avisa, no bloquea ningún botón.
//  - Al volver: cambia a verde "Conexión restablecida" 3 segundos y se oculta.
//  - Con conexión normal: no se ve nada.

import { useEffect, useState } from "react";
import { useConexion } from "@/lib/red/useConexion";

const DURACION_RESTABLECIDA_MS = 3000;

export default function BannerConexion() {
  const enLinea = useConexion();
  const [restablecida, setRestablecida] = useState(false);

  // Detectar el paso de "sin conexión" a "en línea" durante el render
  // (mismo patrón "guardar el valor anterior" de Modal.tsx y del POS), para
  // que el verde aparezca en el mismo instante en que se quita el rojo.
  const [enLineaAnterior, setEnLineaAnterior] = useState(enLinea);
  if (enLinea !== enLineaAnterior) {
    setEnLineaAnterior(enLinea);
    setRestablecida(enLinea);
  }

  // El verde se oculta solo. Si la red se vuelve a caer antes de los 3 s,
  // restablecida pasa a false y el temporizador se cancela.
  useEffect(() => {
    if (!restablecida) return;
    const temporizador = setTimeout(() => setRestablecida(false), DURACION_RESTABLECIDA_MS);
    return () => clearTimeout(temporizador);
  }, [restablecida]);

  const visible = !enLinea || restablecida;

  return (
    // El contenedor siempre existe (aunque esté vacío) para que los lectores
    // de pantalla anuncien el mensaje cuando aparece.
    <div aria-live="assertive" className="sticky top-14 z-30">
      {visible && (
        <div
          className={`flex items-center gap-3 border-b px-4 py-2 text-sm sm:px-8 ${
            enLinea
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${
              enLinea ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full bg-white ${enLinea ? "" : "animate-pulse"}`}
            />
            {enLinea ? "En línea" : "Sin conexión"}
          </span>
          {enLinea ? (
            <p>Conexión restablecida.</p>
          ) : (
            <p>
              <strong className="font-semibold">Se perdió la conexión a internet.</strong>{" "}
              Revisa el Wi-Fi o el cable de red. Mientras tanto, las ventas no se
              podrán registrar en el servidor.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
