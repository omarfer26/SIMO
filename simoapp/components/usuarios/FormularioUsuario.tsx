"use client";

// SCRUM-loginMejora (Camilo) — Formulario de "Crear usuario" (el registro). Lo usa
// solo el Administrador desde /usuarios. Valida cada campo en el navegador
// antes de enviar, muestra el error debajo del campo, un mensaje general si
// el backend responde con error (por ejemplo, correo ya registrado) y
// bloquea todo mientras se envía para no crear el usuario dos veces.
//
// No sabe nada de modales: avisa por `onCreado` y `onCancelar`, y quien lo
// use decide dónde mostrarlo.

import { useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import Select from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { crearUsuario, mensajeDeError } from "@/lib/auth/authService";
import type { CodigoRol, UsuarioCreado } from "@/lib/auth/tipos";
import {
  PASSWORD_MINIMO,
  ROLES,
  validarNuevoUsuario,
  type CamposNuevoUsuario,
  type Errores,
} from "@/lib/auth/validaciones";

interface FormularioUsuarioProps {
  onCreado: (usuario: UsuarioCreado) => void;
  onCancelar: () => void;
}

const datosVacios = {
  nombreCompleto: "",
  correo: "",
  usuario: "",
  rol: "" as CodigoRol | "",
  password: "",
  confirmarPassword: "",
};

export default function FormularioUsuario({
  onCreado,
  onCancelar,
}: FormularioUsuarioProps) {
  const [datos, setDatos] = useState(datosVacios);
  const [errores, setErrores] = useState<Errores<CamposNuevoUsuario>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo: CamposNuevoUsuario, valor: string) => {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const erroresEncontrados = validarNuevoUsuario(datos);
    setErrores(erroresEncontrados);
    setErrorGeneral("");
    // La validación ya garantiza que hay un rol elegido; esta condición
    // además se lo demuestra a TypeScript.
    if (Object.keys(erroresEncontrados).length > 0 || datos.rol === "") return;

    setEnviando(true);
    try {
      const usuario = await crearUsuario({ ...datos, rol: datos.rol });
      onCreado(usuario);
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
        placeholder="Selecciona un rol"
        options={ROLES}
        required
        disabled={enviando}
        value={datos.rol}
        onChange={(e) => cambiar("rol", e.target.value)}
        error={errores.rol}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputText
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={enviando}
          value={datos.password}
          onChange={(e) => cambiar("password", e.target.value)}
          error={errores.password}
          hint={`Mínimo ${PASSWORD_MINIMO} caracteres.`}
        />
        <InputText
          label="Confirmar contraseña"
          name="confirmarPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={enviando}
          value={datos.confirmarPassword}
          onChange={(e) => cambiar("confirmarPassword", e.target.value)}
          error={errores.confirmarPassword}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Creando...
            </>
          ) : (
            "Crear usuario"
          )}
        </Button>
      </div>
    </form>
  );
}
