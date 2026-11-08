"use client";

// SCRUM-loginMejora (Camilo) — Página de Gestión de Usuarios:
//  - Botón "Crear usuario", que abre el formulario de registro
//    (components/usuarios/FormularioUsuario.tsx) dentro del Modal, y aviso
//    verde cuando el usuario queda creado.
//  - Tabla con la lista real de usuarios (DataTable de components/ui). Los
//    cuadros grises (Skeleton) que antes estaban fijos ahora solo se ven
//    mientras la lista carga. Si la lista falla, sale el error con un botón
//    para reintentar. Al crear un usuario la lista se vuelve a pedir, así el
//    nuevo aparece en la tabla.
//  - Se quitó el envoltorio <ProtectedRoute>: ese archivo se borró del
//    proyecto y la página no compilaba. La protección "solo ADMIN" de esta
//    ruta ya la hace middleware.ts.
//
// SCRUM-20 (Camilo) — Filtros por rol y por estado (Activo/Inactivo) arriba
// de la tabla (components/usuarios/FiltrosUsuarios.tsx). Los dos se acumulan,
// la tabla se actualiza apenas se elige una opción, y si ningún usuario
// cumple la combinación sale un mensaje con el botón "Limpiar filtros".
//
// SCRUM-21 (Camilo) — Columna "Acciones" con dos botones por usuario:
//  - "Editar": abre un modal con sus datos (components/usuarios/
//    FormularioEditarUsuario.tsx) para cambiar nombre, correo, usuario y rol.
//  - "Desactivar" / "Activar": abre un modal que pide confirmación
//    (components/usuarios/ConfirmarCambioEstado.tsx).
// Al guardar, la fila se actualiza en la tabla sin volver a pedir toda la
// lista, y sale un aviso verde arriba. El Administrador con la sesión
// abierta se marca con "Tú" y no puede desactivarse ni cambiarse el rol.

import { useEffect, useState, type ReactNode } from "react";
import FiltrosUsuarios, {
  FILTROS_INICIALES,
  filtrarUsuarios,
  hayFiltrosActivos,
  type FiltrosDeUsuarios,
} from "@/components/usuarios/FiltrosUsuarios";
import ConfirmarCambioEstado from "@/components/usuarios/ConfirmarCambioEstado";
import FormularioEditarUsuario from "@/components/usuarios/FormularioEditarUsuario";
import FormularioUsuario from "@/components/usuarios/FormularioUsuario";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { listarUsuarios, mensajeDeError } from "@/lib/auth/authService";
import { leerIdUsuario } from "@/lib/auth/sesion";
import type { UsuarioListado } from "@/lib/auth/tipos";
import { ROLES } from "@/lib/auth/validaciones";

function nombreRol(codigo: string) {
  return ROLES.find((rol) => rol.value === codigo)?.label ?? codigo;
}

// SCRUM-21 — Lo que pasa al hacer clic en los botones de una fila.
interface AccionesFila {
  /** Id del Administrador con la sesión abierta (null si no se sabe). */
  idActual: number | null;
  onEditar: (usuario: UsuarioListado) => void;
  onCambiarEstado: (usuario: UsuarioListado) => void;
}

// Antes las columnas eran fijas; ahora se arman con una función porque la
// columna "Acciones" necesita saber qué hacer al hacer clic y quién es "Tú".
const crearColumnas = ({
  idActual,
  onEditar,
  onCambiarEstado,
}: AccionesFila): ColumnaTabla<UsuarioListado>[] => [
  {
    key: "nombreCompleto",
    header: "Nombre",
    accessor: (u) => u.nombreCompleto,
    render: (u) => (
      <span className="inline-flex items-center gap-2">
        {u.nombreCompleto}
        {u.id === idActual && (
          <Badge variant="info" size="sm" pill>
            Tú
          </Badge>
        )}
      </span>
    ),
    sortable: true,
  },
  { key: "correo", header: "Correo", accessor: (u) => u.correo, sortable: true },
  { key: "usuario", header: "Usuario", accessor: (u) => u.usuario, sortable: true },
  {
    key: "rol",
    header: "Rol",
    accessor: (u) => nombreRol(u.rol),
    sortable: true,
  },
  {
    key: "estado",
    header: "Estado",
    accessor: (u) => (u.activo ? "Activo" : "Inactivo"),
    render: (u) => (
      <Badge variant={u.activo ? "success" : "default"} size="sm" pill>
        {u.activo ? "Activo" : "Inactivo"}
      </Badge>
    ),
    sortable: true,
  },
  {
    key: "acciones",
    header: "Acciones",
    align: "right",
    render: (u) => {
      const esUsuarioActual = u.id === idActual;
      return (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            aria-label={`Editar a ${u.nombreCompleto}`}
            onClick={() => onEditar(u)}
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            aria-label={`${u.activo ? "Desactivar" : "Activar"} a ${u.nombreCompleto}`}
            title={
              esUsuarioActual
                ? "No puedes desactivar tu propia cuenta."
                : undefined
            }
            disabled={esUsuarioActual}
            onClick={() => onCambiarEstado(u)}
            // Mismo ancho para "Activar" y "Desactivar": así los botones
            // "Editar" quedan alineados en todas las filas.
            className="w-28"
          >
            {u.activo ? "Desactivar" : "Activar"}
          </Button>
        </div>
      );
    },
  },
];

// SCRUM-21 — Qué modal de una fila está abierto (solo uno a la vez).
type AccionAbierta =
  | { tipo: "editar"; usuario: UsuarioListado }
  | { tipo: "estado"; usuario: UsuarioListado };

// La lista puede estar en uno de tres momentos, y solo en uno a la vez.
type EstadoLista =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; usuarios: UsuarioListado[] };

// Cuadros grises con la forma de la tabla, mientras llega la lista.
function TablaCargando() {
  return (
    <div
      role="status"
      aria-label="Cargando usuarios"
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
    >
      <div className="bg-zinc-50 dark:bg-zinc-900 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 grid grid-cols-4 gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-6 py-4 grid grid-cols-4 gap-4 items-center">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const [modalAbierto, setModalAbierto] = useState(false);
  // Aviso verde de arriba. Antes solo se usaba al crear; ahora (SCRUM-21)
  // también al editar y al activar/desactivar.
  const [aviso, setAviso] = useState<ReactNode>(null);
  const [accion, setAccion] = useState<AccionAbierta | null>(null);
  const [lista, setLista] = useState<EstadoLista>({ tipo: "cargando" });
  // Cada vez que este número cambia, se vuelve a pedir la lista.
  const [recarga, setRecarga] = useState(0);
  // SCRUM-20 — Qué rol y qué estado están elegidos en los filtros.
  const [filtros, setFiltros] = useState<FiltrosDeUsuarios>(FILTROS_INICIALES);
  const usuariosFiltrados =
    lista.tipo === "lista" ? filtrarUsuarios(lista.usuarios, filtros) : [];

  // SCRUM-21 — La tabla solo se dibuja cuando la lista ya llegó (en el
  // navegador), así que acá ya se puede leer la cookie de la sesión.
  const idActual = leerIdUsuario();
  const columnas = crearColumnas({
    idActual,
    onEditar: (usuario) => setAccion({ tipo: "editar", usuario }),
    onCambiarEstado: (usuario) => setAccion({ tipo: "estado", usuario }),
  });

  // SCRUM-21 — Cambia en la lista solo la fila del usuario que se guardó,
  // sin volver a pedir toda la lista al backend. Los filtros se vuelven a
  // aplicar solos (por ejemplo, si se filtra "Activo" y se desactiva a
  // alguien, desaparece de la tabla).
  const reemplazarEnLista = (actualizado: UsuarioListado) => {
    setLista((previa) =>
      previa.tipo === "lista"
        ? {
            tipo: "lista",
            usuarios: previa.usuarios.map((u) =>
              u.id === actualizado.id ? actualizado : u,
            ),
          }
        : previa,
    );
    setAccion(null);
  };

  useEffect(() => {
    // Si la página se cierra (o se pide otra recarga) antes de que llegue la
    // respuesta, `vigente` evita pintar un resultado viejo.
    let vigente = true;
    listarUsuarios()
      .then((usuarios) => {
        if (vigente) setLista({ tipo: "lista", usuarios });
      })
      .catch((error) => {
        if (vigente) setLista({ tipo: "error", mensaje: mensajeDeError(error) });
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Gestión de Usuarios
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Módulo exclusivo para Administradores.
            </p>
          </div>
          <Button
            onClick={() => {
              setAviso(null);
              setModalAbierto(true);
            }}
          >
            Crear usuario
          </Button>
        </div>

        {aviso && (
          <p
            role="status"
            className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          >
            {aviso}
          </p>
        )}

        <div className="mt-8">
          {lista.tipo === "cargando" && <TablaCargando />}

          {lista.tipo === "error" && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              <span>No se pudo cargar la lista de usuarios. {lista.mensaje}</span>
              <Button
                variant="secondary"
                onClick={() => {
                  setLista({ tipo: "cargando" });
                  setRecarga((n) => n + 1);
                }}
              >
                Reintentar
              </Button>
            </div>
          )}

          {lista.tipo === "lista" && (
            <div className="flex flex-col gap-4">
              <FiltrosUsuarios
                filtros={filtros}
                onCambiar={setFiltros}
                mostrados={usuariosFiltrados.length}
                total={lista.usuarios.length}
              />
              <DataTable
                columns={columnas}
                data={usuariosFiltrados}
                getRowKey={(u) => u.id}
                caption="Lista de usuarios del sistema"
                emptyMessage={
                  hayFiltrosActivos(filtros) ? (
                    <span className="flex flex-col items-center gap-3">
                      No hay usuarios con ese rol y estado.
                      <Button
                        variant="secondary"
                        onClick={() => setFiltros(FILTROS_INICIALES)}
                      >
                        Limpiar filtros
                      </Button>
                    </span>
                  ) : (
                    "Todavía no hay usuarios registrados."
                  )
                }
              />
            </div>
          )}
        </div>
      </main>

      {/* El formulario solo existe mientras el modal está abierto: así cada
          vez que se abre arranca con los campos vacíos. */}
      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Crear usuario"
        maxWidth="xl"
        closeOnBackdropClick={false}
      >
        {modalAbierto && (
          <FormularioUsuario
            onCancelar={() => setModalAbierto(false)}
            onCreado={(usuario) => {
              setAviso(
                <>
                  Usuario <strong>{usuario.nombreCompleto}</strong> creado. Ya
                  puede iniciar sesión con el correo{" "}
                  <strong>{usuario.correo}</strong>.
                </>,
              );
              setModalAbierto(false);
              setRecarga((n) => n + 1);
            }}
          />
        )}
      </Modal>

      {/* SCRUM-21 — Modal "Editar usuario". El `key` hace que, si se abre
          para otro usuario, el formulario arranque de cero con sus datos. */}
      <Modal
        isOpen={accion?.tipo === "editar"}
        onClose={() => setAccion(null)}
        title="Editar usuario"
        maxWidth="xl"
        closeOnBackdropClick={false}
      >
        {accion?.tipo === "editar" && (
          <FormularioEditarUsuario
            key={accion.usuario.id}
            usuario={accion.usuario}
            esUsuarioActual={accion.usuario.id === idActual}
            onCancelar={() => setAccion(null)}
            onGuardado={(usuario) => {
              reemplazarEnLista(usuario);
              setAviso(
                <>
                  Se guardaron los cambios de{" "}
                  <strong>{usuario.nombreCompleto}</strong>.
                </>,
              );
            }}
          />
        )}
      </Modal>

      {/* SCRUM-21 — Modal que confirma activar o desactivar. */}
      <Modal
        isOpen={accion?.tipo === "estado"}
        onClose={() => setAccion(null)}
        title={
          accion?.tipo === "estado" && !accion.usuario.activo
            ? "Activar usuario"
            : "Desactivar usuario"
        }
        maxWidth="md"
      >
        {accion?.tipo === "estado" && (
          <ConfirmarCambioEstado
            key={accion.usuario.id}
            usuario={accion.usuario}
            onCancelar={() => setAccion(null)}
            onCambiado={(usuario) => {
              reemplazarEnLista(usuario);
              setAviso(
                usuario.activo ? (
                  <>
                    <strong>{usuario.nombreCompleto}</strong> quedó activo: ya
                    puede iniciar sesión.
                  </>
                ) : (
                  <>
                    <strong>{usuario.nombreCompleto}</strong> quedó inactivo:
                    ya no puede iniciar sesión.
                  </>
                ),
              );
            }}
          />
        )}
      </Modal>
    </>
  );
}
