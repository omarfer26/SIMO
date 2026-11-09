// SCRUM-125 (Camilo) — Filtro de la lista de pedidos por rango de fechas:
// dos selectores de fecha (Desde / Hasta), atajos de un clic ("Hoy",
// "Últimos 7 días", "Este mes") y el botón "Limpiar filtro".
// Igual que FiltrosUsuarios, este componente solo dibuja los controles y
// avisa cuando cambian: quien guarda el rango y filtra es la página
// (/pedidos), con la función `filtrarPorFechas` de acá abajo.
//
// Las fechas se manejan como texto "AAAA-MM-DD" (lo que entrega el
// <input type="date">), y cada pedido se compara por el DÍA en que se hizo,
// en la hora del computador (Colombia): así "Hasta 15" incluye un pedido
// del 15 a las 11 p. m.

import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import type { Pedido } from "@/lib/pedidos/tipos";

export interface RangoFechas {
  /** "" = sin límite inicial. */
  desde: string;
  /** "" = sin límite final. */
  hasta: string;
}

export const RANGO_VACIO: RangoFechas = { desde: "", hasta: "" };

// Día de una fecha en hora local, como "AAAA-MM-DD". No se usa
// toISOString() porque ese da el día en hora de Londres (UTC): un pedido
// del 15 a las 8 p. m. en Colombia saldría como del 16.
export function diaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function hayRango(rango: RangoFechas) {
  return rango.desde !== "" || rango.hasta !== "";
}

// "AAAA-MM-DD" se puede comparar como texto: el orden alfabético es el
// mismo que el de las fechas.
export function rangoInvalido(rango: RangoFechas) {
  return rango.desde !== "" && rango.hasta !== "" && rango.desde > rango.hasta;
}

// Se queda con los pedidos hechos entre `desde` y `hasta`, incluidos los
// dos días. Si solo hay uno de los dos, el otro lado queda abierto. Si el
// rango está al revés no se filtra (el formulario ya muestra el error).
export function filtrarPorFechas(pedidos: Pedido[], rango: RangoFechas) {
  if (!hayRango(rango) || rangoInvalido(rango)) return pedidos;
  return pedidos.filter((pedido) => fechaEnRango(pedido.fechaSolicitud, rango));
}

// SCRUM-39 (Camilo) — La comparación de un día contra el rango, sacada de
// filtrarPorFechas para que el Kardex filtre sus movimientos igual.
export function fechaEnRango(fecha: Date, rango: RangoFechas) {
  const dia = diaLocal(fecha);
  return (rango.desde === "" || dia >= rango.desde) && (rango.hasta === "" || dia <= rango.hasta);
}

// Atajos: cada uno arma su rango a partir de hoy.
const ATAJOS: { nombre: string; rango: () => RangoFechas }[] = [
  {
    nombre: "Hoy",
    rango: () => {
      const hoy = diaLocal(new Date());
      return { desde: hoy, hasta: hoy };
    },
  },
  {
    nombre: "Últimos 7 días",
    rango: () => {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - 6);
      return { desde: diaLocal(inicio), hasta: diaLocal(new Date()) };
    },
  },
  {
    nombre: "Este mes",
    rango: () => {
      const hoy = new Date();
      const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: diaLocal(primero), hasta: diaLocal(hoy) };
    },
  },
];

interface FiltroFechasPedidosProps {
  rango: RangoFechas;
  onCambiar: (rango: RangoFechas) => void;
  /** Cuántos pedidos quedan después de filtrar, y cuántos hay en total. */
  mostrados: number;
  total: number;
  /** SCRUM-39 (Camilo) — Qué se cuenta en el mensaje de abajo. Por defecto, pedidos. */
  nombres?: { singular: string; plural: string };
}

export default function FiltroFechasPedidos({
  rango,
  onCambiar,
  mostrados,
  total,
  nombres = { singular: "pedido", plural: "pedidos" },
}: FiltroFechasPedidosProps) {
  const hoy = diaLocal(new Date());
  const invalido = rangoInvalido(rango);
  const filtrando = hayRango(rango) && !invalido;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        {/* min/max: el calendario no deja elegir un "Desde" después del
            "Hasta" (ni al revés), ni días futuros. Si igual se escribe a
            mano una fecha al revés, sale el error en "Hasta". */}
        <InputText
          type="date"
          label="Desde"
          className="w-full sm:w-52"
          value={rango.desde}
          max={rango.hasta || hoy}
          onChange={(e) => onCambiar({ ...rango, desde: e.target.value })}
        />
        <InputText
          type="date"
          label="Hasta"
          className="w-full sm:w-52"
          value={rango.hasta}
          min={rango.desde || undefined}
          max={hoy}
          error={invalido ? "No puede ser antes de «Desde»." : undefined}
          onChange={(e) => onCambiar({ ...rango, hasta: e.target.value })}
        />

        {/* sm:mt-6: baja los botones a la altura de las cajas (debajo de
            las etiquetas "Desde" / "Hasta"). */}
        <div className="flex flex-wrap gap-2 sm:mt-6">
          {ATAJOS.map((atajo) => {
            const r = atajo.rango();
            const activo = r.desde === rango.desde && r.hasta === rango.hasta;
            // El atajo que coincide con el rango elegido se pinta en verde.
            return (
              <Button
                key={atajo.nombre}
                variant={activo ? "primary" : "secondary"}
                aria-pressed={activo}
                onClick={() => onCambiar(r)}
              >
                {atajo.nombre}
              </Button>
            );
          })}
          {hayRango(rango) && (
            <Button variant="secondary" onClick={() => onCambiar(RANGO_VACIO)}>
              Limpiar filtro
            </Button>
          )}
        </div>
      </div>

      {/* aria-live: un lector de pantalla anuncia el resultado al filtrar. */}
      <p aria-live="polite" className="text-sm text-zinc-500 dark:text-zinc-400">
        {invalido
          ? `Corrige las fechas para filtrar. Mientras tanto se ven los ${total} ${nombres.plural}.`
          : filtrando
            ? `${mostrados} de ${total} ${nombres.plural} en ese período.`
            : `${total} ${total === 1 ? nombres.singular : nombres.plural} en total.`}
      </p>
    </div>
  );
}
