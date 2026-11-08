// Consola de descargas de reportes — Barra de filtros (solo presentación).
//
// Igual que FiltrosUsuarios y FiltroFechasPedidos: dibuja los controles y avisa
// cuando cambian; quien guarda el valor elegido y filtra la lista es la consola
// (ConsolaDescargasReportes). Reusa FiltroFechasPedidos para el rango
// Desde/Hasta (con sus atajos "Hoy", "Últimos 7 días", "Este mes"), y agrega el
// filtro por tipo de documento (Excel/PDF/Word), por categoría y una búsqueda.

import FiltroFechasPedidos from "@/components/pedidos/FiltroFechasPedidos";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import Select from "@/components/ui/Select";
import {
  FILTROS_INICIALES,
  OPCIONES_CATEGORIA,
  OPCIONES_FORMATO,
  hayFiltrosActivos,
  type FiltroCategoria,
  type FiltroFormato,
  type FiltrosReportes,
} from "@/lib/reportes/tipos";

interface FiltrosReportesProps {
  filtros: FiltrosReportes;
  onCambiar: (filtros: FiltrosReportes) => void;
  /** Cuántos reportes hay en total. */
  total: number;
  /** Cuántos quedan solo con el rango de fechas (para el mensaje del filtro). */
  mostradosPorFecha: number;
}

export default function FiltrosReportes({
  filtros,
  onCambiar,
  total,
  mostradosPorFecha,
}: FiltrosReportesProps) {
  const filtrando = hayFiltrosActivos(filtros);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      {/* Rango de fechas (Desde/Hasta + atajos), reutilizado de Pedidos. Su
          mensaje de abajo habla solo del período, por eso recibe el conteo
          filtrado únicamente por fecha. */}
      <FiltroFechasPedidos
        rango={filtros.rango}
        onCambiar={(rango) => onCambiar({ ...filtros, rango })}
        mostrados={mostradosPorFecha}
        total={total}
        nombres={{ singular: "reporte", plural: "reportes" }}
      />

      {/* Tipo de documento, categoría y búsqueda. */}
      <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Select
          label="Tipo de documento"
          className="w-full sm:w-56"
          options={OPCIONES_FORMATO}
          value={filtros.formato}
          onChange={(e) =>
            onCambiar({ ...filtros, formato: e.target.value as FiltroFormato })
          }
        />
        <Select
          label="Categoría"
          className="w-full sm:w-52"
          options={OPCIONES_CATEGORIA}
          value={filtros.categoria}
          onChange={(e) =>
            onCambiar({
              ...filtros,
              categoria: e.target.value as FiltroCategoria,
            })
          }
        />
        <InputText
          type="search"
          label="Buscar"
          className="w-full sm:w-64"
          placeholder="Nombre o archivo…"
          value={filtros.busqueda}
          onChange={(e) => onCambiar({ ...filtros, busqueda: e.target.value })}
        />
        {filtrando && (
          <Button variant="secondary" onClick={() => onCambiar(FILTROS_INICIALES)}>
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
