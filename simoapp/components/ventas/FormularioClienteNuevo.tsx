"use client";

// SCRUM-123 (Camilo) — Formulario corto para registrar un cliente desde el
// POS cuando el buscador no lo encuentra. Al guardarlo queda elegido para la
// venta. Si el documento ya estaba registrado (409 del backend), muestra a
// quién pertenece y deja usarlo con un clic, en vez de solo dar error.

import { useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import Select from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import type { Errores } from "@/lib/auth/validaciones";
import {
  ErrorCliente,
  mensajeErrorCliente,
  registrarCliente,
} from "@/lib/clientes/clientesService";
import {
  formatoDocumento,
  normalizarDocumento,
  pareceDocumento,
  validarClienteNuevo,
  type CampoClienteNuevo,
} from "@/lib/clientes/validaciones";
import {
  TIPOS_DOCUMENTO,
  type Cliente,
  type DatosClienteNuevo,
  type TipoDocumento,
} from "@/lib/clientes/tipos";

interface FormularioClienteNuevoProps {
  /** Lo que se había escrito en el buscador: va al documento o al nombre. */
  textoBuscado: string;
  onRegistrado: (cliente: Cliente) => void;
  onVolver: () => void;
}

export default function FormularioClienteNuevo({
  textoBuscado,
  onRegistrado,
  onVolver,
}: FormularioClienteNuevoProps) {
  const esDocumento = pareceDocumento(textoBuscado);
  const [datos, setDatos] = useState<DatosClienteNuevo>({
    tipoDocumento: "CC",
    documento: esDocumento ? normalizarDocumento(textoBuscado) : "",
    nombre: esDocumento ? "" : textoBuscado,
    telefono: "",
    correo: "",
    direccion: "",
  });
  const [errores, setErrores] = useState<Errores<CampoClienteNuevo>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [existente, setExistente] = useState<Cliente | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo: CampoClienteNuevo, valor: string) => {
    setDatos((previo) => ({ ...previo, [campo]: valor }));
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
    if (campo === "documento") setExistente(null);
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const encontrados = validarClienteNuevo(datos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setEnviando(true);
    setErrorGeneral("");
    try {
      onRegistrado(await registrarCliente(datos));
    } catch (error) {
      if (error instanceof ErrorCliente && error.tipo === "duplicado" && error.existente) {
        setExistente(error.existente);
      } else {
        setErrorGeneral(mensajeErrorCliente(error));
      }
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

      {existente && (
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p>
            Ese documento ya está registrado a nombre de{" "}
            <strong>{existente.nombre}</strong> ({existente.tipoDocumento}{" "}
            {formatoDocumento(existente.documento)}).
          </p>
          {existente.activo ? (
            <button
              type="button"
              onClick={() => onRegistrado(existente)}
              className="mt-1 font-medium underline"
            >
              Usar este cliente
            </button>
          ) : (
            <p className="mt-1 text-xs">
              Ese cliente está inactivo. Pide a un administrador que lo reactive.
            </p>
          )}
        </div>
      )}

      <fieldset disabled={enviando} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Tipo de documento"
          name="tipoDocumento"
          required
          options={TIPOS_DOCUMENTO}
          value={datos.tipoDocumento}
          onChange={(e) => cambiar("tipoDocumento", e.target.value as TipoDocumento)}
        />
        <InputText
          label="Número de documento"
          name="documento"
          required
          autoFocus={!esDocumento}
          inputMode={datos.tipoDocumento === "PAS" ? "text" : "numeric"}
          placeholder={datos.tipoDocumento === "NIT" ? "900123456-7" : "1090123456"}
          value={datos.documento}
          onChange={(e) => cambiar("documento", e.target.value)}
          error={errores.documento}
          hint="Los puntos y espacios se quitan solos. No se puede cambiar después."
        />
        <InputText
          label={datos.tipoDocumento === "NIT" ? "Razón social" : "Nombre completo"}
          name="nombre"
          required
          autoFocus={esDocumento}
          className="sm:col-span-2"
          value={datos.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          error={errores.nombre}
        />
        <InputText
          type="tel"
          label="Teléfono"
          name="telefono"
          placeholder="310 555 1234"
          value={datos.telefono}
          onChange={(e) => cambiar("telefono", e.target.value)}
          error={errores.telefono}
        />
        <InputText
          type="email"
          label="Correo"
          name="correo"
          placeholder="nombre@correo.com"
          value={datos.correo}
          onChange={(e) => cambiar("correo", e.target.value)}
          error={errores.correo}
        />
        <InputText
          label="Dirección"
          name="direccion"
          className="sm:col-span-2"
          value={datos.direccion}
          onChange={(e) => cambiar("direccion", e.target.value)}
          error={errores.direccion}
        />
      </fieldset>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onVolver} disabled={enviando}>
          Volver a buscar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Guardando...
            </>
          ) : (
            "Guardar y usar en la venta"
          )}
        </Button>
      </div>
    </form>
  );
}
