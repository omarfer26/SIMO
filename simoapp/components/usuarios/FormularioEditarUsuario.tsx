"use client";

// SCRUM-21 (Camilo) — Formulario del modal "Editar usuario". Arranca lleno
// con los datos actuales del usuario y deja cambiar nombre completo, correo,
// nombre de usuario y rol (la contraseña no: es otro flujo). Valida igual
// que "Crear usuario" (validarEdicionUsuario), muestra el error del backend
// arriba (por ejemplo, correo que ya tiene otro usuario) y bloquea todo
// mientras guarda.
//  - "Guardar cambios" queda deshabilitado mientras no se haya cambiado nada.
//  - Si el usuario que se edita es el mismo Administrador que tiene la
//    sesión abierta (`esUsuarioActual`), el rol no se puede cambiar, para
//    que no se quite a sí mismo el acceso a este módulo.
//
// Igual que FormularioUsuario, no sabe nada de modales: avisa por
// `onGuardado` y `onCancelar`.

import { useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import Select from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { editarUsuario, mensajeDeError } from "@/lib/auth/authService";
import type {
  CodigoRol,
  DatosEdicionUsuario,
  UsuarioListado,
} from "@/lib/auth/tipos";
import {
  ROLES,
  validarEdicionUsuario,
  type Errores,
} from "@/lib/auth/validaciones";

interface FormularioEditarUsuarioProps {
  usuario: UsuarioListado;
  /** true si es la fila del mismo Administrador que tiene la sesión abierta. */
  esUsuarioActual: boolean;
  onGuardado: (usuario: UsuarioListado) => void;
  onCancelar: () => void;
}

type CampoEdicion = keyof DatosEdicionUsuario;

export default function FormularioEditarUsuario({
  usuario,
  esUsuarioActual,
  onGuardado,
  onCancelar,
}: FormularioEditarUsuarioProps) {
  const original: DatosEdicionUsuario = {
    nombreCompleto: usuario.nombreCompleto,
    correo: usuario.correo,
    usuario: usuario.usuario,
    rol: usuario.rol,
  };
  const [datos, setDatos] = useState(original);
  const [errores, setErrores] = useState<Errores<CampoEdicion>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Se compara sin espacios sobrantes: agregar un espacio al final no cuenta
  // como cambio.
  const huboCambios =
    datos.nombreCompleto.trim() !== original.nombreCompleto ||
    datos.correo.trim().toLowerCase() !== original.correo ||
    datos.usuario.trim() !== original.usuario ||
    datos.rol !== original.rol;

  const cambiar = (campo: CampoEdicion, valor: string) => {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando || !huboCambios) return;

    const erroresEncontrados = validarEdicionUsuario(datos);
    setErrores(erroresEncontrados);
    setErrorGeneral("");
    if (Object.keys(erroresEncontrados).length > 0) return;

    setEnviando(true);
    try {
      const actualizado = await editarUsuario(usuario.id, datos);
      onGuardado(actualizado);
    } catch (error) {
      setErrorGeneral(mensajeDeError(error));
      setEnviando(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {errorGeneral && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorGeneral}
        </p>
      )}

      <InputText
        label="Nombre completo"
        name="nombreCompleto"
        autoComplete="off"
        required
        disabled={enviando}
        value={datos.nombreCompleto}
        onChange={(e) => cambiar("nombreCompleto", e.target.value)}
        error={errores.nombreCompleto}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputText
          label="Correo electrónico"
          name="correo"
          type="email"
          autoComplete="off"
          placeholder="nombre@empresa.com"
          required
          disabled={enviando}
          value={datos.correo}
          onChange={(e) => cambiar("correo", e.target.value)}
          error={errores.correo}
          hint="Es con el que inicia sesión."
        />
        <InputText
          label="Nombre de usuario"
          name="usuario"
          autoComplete="off"
          required
          disabled={enviando}
          value={datos.usuario}
          onChange={(e) => cambiar("usuario", e.target.value)}
          error={errores.usuario}
        />
      </div>
      <Select
        label="Rol"
        name="rol"
        options={ROLES}
        required
        disabled={enviando || esUsuarioActual}
        value={datos.rol}
        onChange={(e) => cambiar("rol", e.target.value as CodigoRol)}
        error={errores.rol}
        hint={
          esUsuarioActual
            ? "No puedes cambiar tu propio rol: perderías el acceso a este módulo."
            : undefined
        }
      />

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando || !huboCambios}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Guardando...
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>
      </div>
    </form>
  );
}
