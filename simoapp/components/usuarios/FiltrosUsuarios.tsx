// SCRUM-20 (Camilo) — Filtros de la tabla de usuarios: una lista desplegable
// de Rol y otra de Estado (Activo/Inactivo), más el botón "Limpiar filtros".
// Este componente solo dibuja los controles y avisa cuando cambian: quien
// guarda el valor elegido y filtra la lista es la página (/usuarios). La
// función `filtrarUsuarios` de acá abajo es la que aplica los dos filtros a
// la vez (se acumulan: rol Y estado).

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import type { CodigoRol, UsuarioListado } from "@/lib/auth/tipos";
import { ROLES } from "@/lib/auth/validaciones";

export type FiltroRol = CodigoRol | "todos";
export type FiltroEstadoUsuario = "todos" | "activo" | "inactivo";

export interface FiltrosDeUsuarios {
  rol: FiltroRol;
  estado: FiltroEstadoUsuario;
}

export const FILTROS_INICIALES: FiltrosDeUsuarios = {
  rol: "todos",
  estado: "todos",
};

// Las opciones de rol salen de ROLES (la misma lista del formulario de
// "Crear usuario"): si se agrega un rol allá, aparece acá sin tocar nada.
const opcionesRol = [{ value: "todos", label: "Todos los roles" }, ...ROLES];

const opcionesEstado = [
  { value: "todos", label: "Todos los estados" },
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
];

export function hayFiltrosActivos(filtros: FiltrosDeUsuarios) {
  return filtros.rol !== "todos" || filtros.estado !== "todos";
}

// Se queda con los usuarios que cumplen los dos filtros al mismo tiempo.
export function filtrarUsuarios(
  usuarios: UsuarioListado[],
  filtros: FiltrosDeUsuarios,
) {
  return usuarios.filter((usuario) => {
    const coincideRol = filtros.rol === "todos" || usuario.rol === filtros.rol;
    const coincideEstado =
      filtros.estado === "todos" ||
      usuario.activo === (filtros.estado === "activo");
    return coincideRol && coincideEstado;
  });
}

interface FiltrosUsuariosProps {
  filtros: FiltrosDeUsuarios;
  onCambiar: (filtros: FiltrosDeUsuarios) => void;
  /** Cuántos usuarios quedan después de filtrar, y cuántos hay en total. */
  mostrados: number;
  total: number;
}

export default function FiltrosUsuarios({
  filtros,
  onCambiar,
  mostrados,
  total,
}: FiltrosUsuariosProps) {
  const filtrando = hayFiltrosActivos(filtros);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Rol"
          className="w-full sm:w-60"
          options={opcionesRol}
          value={filtros.rol}
          onChange={(e) =>
            onCambiar({ ...filtros, rol: e.target.value as FiltroRol })
          }
        />
        <Select
          label="Estado"
          className="w-full sm:w-48"
          options={opcionesEstado}
          value={filtros.estado}
          onChange={(e) =>
            onCambiar({
              ...filtros,
              estado: e.target.value as FiltroEstadoUsuario,
            })
          }
        />
        {filtrando && (
          <Button variant="secondary" onClick={() => onCambiar(FILTROS_INICIALES)}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* aria-live: un lector de pantalla anuncia el resultado al filtrar. */}
      <p aria-live="polite" className="text-sm text-zinc-500 dark:text-zinc-400">
        {filtrando
          ? `${mostrados} de ${total} usuarios cumplen los filtros.`
          : `${total} ${total === 1 ? "usuario" : "usuarios"} en total.`}
      </p>
    </div>
  );
}
