"use client";

// SCRUM-111 (Camilo) — Formulario modal para editar los parámetros de la
// empresa (Razón Social, NIT, teléfono, dirección y logo). Es "controlado"
// por la página que lo usa: recibe la empresa actual y dos funciones
// (`onGuardar`, `onCerrar`), y no sabe nada de dónde viven esos datos. No
// hay backend todavía, así que "guardar" solo arma el objeto actualizado y
// se lo pasa al padre — ver limitación documentada en camilo-sanchez.md.
// SCRUM-108 (Camilo) — Los 4 campos y los botones Cancelar/Guardar ahora usan
// los componentes base de components/ui (InputText y Button), en vez del
// CampoTexto y los <button> que estaban escritos a mano en este archivo.

import { useEffect, useState } from "react";
import type { Empresa } from "@/components/shell/tipos";
import Button from "@/components/ui/Button";
import InputText from "@/components/ui/InputText";
import FileUpload from "./FileUpload";

interface FormularioEmpresaProps {
  empresa: Empresa;
  onCerrar: () => void;
  onGuardar: (empresa: Empresa) => void;
}

type CamposTexto = "razonSocial" | "nit" | "telefono" | "direccion";

// El padre solo monta este componente mientras el modal está abierto (ver
// app/admin/page.tsx: `{modalAbierto && <FormularioEmpresa ... />}`). Así,
// cada vez que se abre es un componente nuevo: el estado ya nace limpio,
// tomado de `empresa`, sin necesitar un useEffect que lo "resetee".
export default function FormularioEmpresa({
  empresa,
  onCerrar,
  onGuardar,
}: FormularioEmpresaProps) {
  const [valores, setValores] = useState(empresa);
  const [archivoLogo, setArchivoLogo] = useState<File | null>(null);
  const [logoActual, setLogoActual] = useState(empresa.logoUrl);
  const [errores, setErrores] = useState<Partial<Record<CamposTexto, string>>>(
    {},
  );

  useEffect(() => {
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  function actualizarCampo(campo: CamposTexto, valor: string) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    // Si el campo tenía marcado el error de "obligatorio" de un intento de
    // guardar anterior, se quita apenas el usuario empieza a corregirlo, en
    // vez de dejarlo pegado en rojo hasta el próximo submit.
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const resto = { ...prev };
      delete resto[campo];
      return resto;
    });
  }

  function manejarSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nuevosErrores: Partial<Record<CamposTexto, string>> = {};
    (["razonSocial", "nit", "telefono", "direccion"] as CamposTexto[]).forEach(
      (campo) => {
        if (!valores[campo].trim()) {
          nuevosErrores[campo] = "Este campo es obligatorio.";
        }
      },
    );

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    onGuardar({
      ...valores,
      logoUrl: archivoLogo ? URL.createObjectURL(archivoLogo) : logoActual,
    });
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onCerrar}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Editar datos de la empresa
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* noValidate: la validación la hace manejarSubmit y los errores se
            muestran con el estilo de InputText. Sin esto, el `required` de
            los campos haría que el navegador mostrara su propio globito de
            error antes de llegar a manejarSubmit. */}
        <form
          onSubmit={manejarSubmit}
          noValidate
          className="mt-4 space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Logo
            </label>
            <FileUpload
              archivo={archivoLogo}
              valorActual={logoActual}
              onArchivoSeleccionado={setArchivoLogo}
              onQuitar={() => {
                setArchivoLogo(null);
                setLogoActual(null);
              }}
            />
          </div>

          <InputText
            id="razonSocial"
            label="Razón Social"
            required
            value={valores.razonSocial}
            error={errores.razonSocial}
            onChange={(e) => actualizarCampo("razonSocial", e.target.value)}
          />
          <InputText
            id="nit"
            label="NIT"
            required
            value={valores.nit}
            error={errores.nit}
            onChange={(e) => actualizarCampo("nit", e.target.value)}
          />
          <InputText
            id="telefono"
            label="Teléfono"
            required
            value={valores.telefono}
            error={errores.telefono}
            onChange={(e) => actualizarCampo("telefono", e.target.value)}
          />
          <InputText
            id="direccion"
            label="Dirección"
            required
            value={valores.direccion}
            error={errores.direccion}
            onChange={(e) => actualizarCampo("direccion", e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">Guardar cambios</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
