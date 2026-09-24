"use client";

// SCRUM-108 (Camilo) — Página de muestra (/componentes) del sistema de
// componentes base de components/ui (Button, InputText, InputNumber y
// Select). Sirve de referencia para el equipo: muestra cada variante y cada
// estado (normal, con ayuda, con error, deshabilitado) y trae un mini
// formulario con validación para ver los errores en acción. No aparece en
// el Sidebar a propósito (no es un módulo del sistema): se entra escribiendo
// /componentes en la barra de direcciones.
// Los ejemplos "con error" de las secciones de arriba son muestras fijas (el
// mensaje está escrito aquí y no se puede editar el valor), para que no
// parezca un error del sistema que sigan en rojo. La validación de verdad
// está en la sección "Ejemplo con validación", al final.

import { useState } from "react";
import Button from "@/components/ui/Button";
import InputNumber from "@/components/ui/InputNumber";
import InputText from "@/components/ui/InputText";
import Select from "@/components/ui/Select";
import { CATEGORIAS } from "@/components/catalogo/tipos";

const opcionesCategoria = CATEGORIAS.map((categoria) => ({
  value: categoria,
  label: categoria,
}));

type CampoEjemplo = "nombre" | "precio" | "categoria";

const valoresVacios: Record<CampoEjemplo, string> = {
  nombre: "",
  precio: "",
  categoria: "",
};

export default function ComponentesPage() {
  const [valores, setValores] = useState(valoresVacios);
  const [errores, setErrores] = useState<Partial<Record<CampoEjemplo, string>>>(
    {},
  );
  const [enviado, setEnviado] = useState(false);

  function actualizarCampo(campo: CampoEjemplo, valor: string) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const resto = { ...prev };
      delete resto[campo];
      return resto;
    });
    setEnviado(false);
  }

  function manejarSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nuevosErrores: Partial<Record<CampoEjemplo, string>> = {};
    if (!valores.nombre.trim()) {
      nuevosErrores.nombre = "El nombre es obligatorio.";
    }
    if (valores.precio === "") {
      nuevosErrores.precio = "El precio es obligatorio.";
    } else if (Number(valores.precio) <= 0) {
      nuevosErrores.precio = "El precio debe ser mayor a 0.";
    }
    if (!valores.categoria) {
      nuevosErrores.categoria = "Seleccione una categoría.";
    }

    setErrores(nuevosErrores);
    setEnviado(Object.keys(nuevosErrores).length === 0);
  }

  function limpiar() {
    setValores(valoresVacios);
    setErrores({});
    setEnviado(false);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Componentes base
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Referencia visual de los componentes reutilizables de{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
          components/ui
        </code>
        . Úsalos en los formularios nuevos en vez de escribir los estilos a
        mano.
      </p>

      <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        Los campos en rojo de las secciones InputText, InputNumber y Select son{" "}
        <strong>muestras fijas</strong>: enseñan cómo se ve un error, pero no
        validan lo que se escribe ni se pueden cambiar. Para probar la
        validación de verdad, usa el{" "}
        <a href="#ejemplo-validacion" className="font-medium underline">
          Ejemplo con validación
        </a>{" "}
        al final de la página.
      </div>

      <Seccion
        titulo="Button"
        importar='import Button from "@/components/ui/Button";'
        descripcion="primary para la acción principal, secondary para acciones neutras (Cancelar, Volver) y danger para acciones destructivas (Anular venta, Cancelar pedido)."
      >
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button disabled>Primary</Button>
          <Button variant="secondary" disabled>
            Secondary
          </Button>
          <Button variant="danger" disabled>
            Danger
          </Button>
          <span className="self-center text-xs text-zinc-500 dark:text-zinc-400">
            ← deshabilitados
          </span>
        </div>
      </Seccion>

      <Seccion
        titulo="InputText"
        importar='import InputText from "@/components/ui/InputText";'
        descripcion="Con label, hint (ayuda en gris) y error (borde y mensaje en rojo). required agrega el asterisco."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputText label="Normal" placeholder="Ej: Comercial San Andresito" />
          <InputText
            label="Con ayuda"
            placeholder="Ej: 900123456-7"
            hint="Sin puntos, con dígito de verificación."
          />
          <InputText
            label="Con error"
            required
            readOnly
            defaultValue="correo-invalido"
            error="Ingrese un correo válido."
          />
          <InputText label="Deshabilitado" defaultValue="No editable" disabled />
        </div>
      </Seccion>

      <Seccion
        titulo="InputNumber"
        importar='import InputNumber from "@/components/ui/InputNumber";'
        descripcion="Para precios, cantidades y stock. Abre el teclado numérico en celular y la rueda del mouse no cambia el valor."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputNumber label="Cantidad" placeholder="0" min={0} />
          <InputNumber
            label="Stock mínimo"
            required
            readOnly
            defaultValue={-5}
            error="El stock mínimo no puede ser negativo."
          />
        </div>
      </Seccion>

      <Seccion
        titulo="Select"
        importar='import Select from "@/components/ui/Select";'
        descripcion="Las opciones van en options como { value, label }. placeholder agrega la primera opción vacía."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Categoría"
            placeholder="Seleccione una categoría"
            options={opcionesCategoria}
          />
          <Select
            label="Método de pago"
            required
            placeholder="Seleccione un método"
            // Un <select> no tiene modo "solo lectura" (y `disabled` lo
            // pondría gris, tapando el rojo del error): por eso la muestra
            // deshabilita cada opción, así se ve la lista pero no se elige.
            options={[
              { value: "efectivo", label: "Efectivo", disabled: true },
              { value: "nequi", label: "Nequi", disabled: true },
              { value: "daviplata", label: "Daviplata", disabled: true },
            ]}
            error="Seleccione cómo pagó el cliente."
          />
        </div>
      </Seccion>

      <Seccion
        id="ejemplo-validacion"
        titulo="Ejemplo con validación"
        descripcion='Presione "Validar" con los campos vacíos para ver los errores; desaparecen apenas se corrige cada campo.'
      >
        {/* noValidate: los errores los muestra manejarSubmit con el estilo de
            los componentes, en vez del globito nativo del navegador. */}
        <form onSubmit={manejarSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputText
              label="Nombre del producto"
              required
              className="sm:col-span-2"
              placeholder="Ej: Audífonos Bluetooth"
              value={valores.nombre}
              error={errores.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
            />
            <InputNumber
              label="Precio de venta"
              required
              min={0}
              placeholder="0"
              value={valores.precio}
              error={errores.precio}
              onChange={(e) => actualizarCampo("precio", e.target.value)}
            />
            <Select
              label="Categoría"
              required
              placeholder="Seleccione una categoría"
              options={opcionesCategoria}
              value={valores.categoria}
              error={errores.categoria}
              onChange={(e) => actualizarCampo("categoria", e.target.value)}
            />
          </div>

          {enviado && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              Todos los campos son válidos.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={limpiar}>
              Limpiar
            </Button>
            <Button type="submit">Validar</Button>
          </div>
        </form>
      </Seccion>
    </div>
  );
}

interface SeccionProps {
  id?: string;
  titulo: string;
  descripcion: string;
  importar?: string;
  children: React.ReactNode;
}

function Seccion({
  id,
  titulo,
  descripcion,
  importar,
  children,
}: SeccionProps) {
  // scroll-mt-20: al saltar con el link de la nota, deja espacio para que
  // el Navbar (fijo arriba, 56px) no tape el título de la sección.
  return (
    <section
      id={id}
      className="mt-8 scroll-mt-20 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {titulo}
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {descripcion}
      </p>
      {importar && (
        <code className="mt-2 block overflow-x-auto rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {importar}
        </code>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}
