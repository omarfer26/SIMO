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

import { useEffect, useState } from "react";
import FormularioUsuario from "@/components/usuarios/FormularioUsuario";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { listarUsuarios, mensajeDeError } from "@/lib/auth/authService";
import type { UsuarioCreado, UsuarioListado } from "@/lib/auth/tipos";
import { ROLES } from "@/lib/auth/validaciones";

function nombreRol(codigo: string) {
  return ROLES.find((rol) => rol.value === codigo)?.label ?? codigo;
}

const columnas: ColumnaTabla<UsuarioListado>[] = [
  {
    key: "nombreCompleto",
    header: "Nombre",
    accessor: (u) => u.nombreCompleto,
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
];

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
  const [usuarioCreado, setUsuarioCreado] = useState<UsuarioCreado | null>(null);
  const [lista, setLista] = useState<EstadoLista>({ tipo: "cargando" });
  // Cada vez que este número cambia, se vuelve a pedir la lista.
  const [recarga, setRecarga] = useState(0);

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
              setUsuarioCreado(null);
              setModalAbierto(true);
            }}
          >
            Crear usuario
          </Button>
        </div>

        {usuarioCreado && (
          <p
            role="status"
            className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          >
            Usuario <strong>{usuarioCreado.nombreCompleto}</strong> creado. Ya
            puede iniciar sesión con el correo{" "}
            <strong>{usuarioCreado.correo}</strong>.
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
            <DataTable
              columns={columnas}
              data={lista.usuarios}
              getRowKey={(u) => u.id}
              caption="Lista de usuarios del sistema"
              emptyMessage="Todavía no hay usuarios registrados."
            />
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
              setUsuarioCreado(usuario);
              setModalAbierto(false);
              setRecarga((n) => n + 1);
            }}
          />
        )}
      </Modal>
    </>
  );
}
