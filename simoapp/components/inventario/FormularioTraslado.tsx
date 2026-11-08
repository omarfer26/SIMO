"use client";

// SCRUM-124 (Camilo) — Contenido del modal "Trasladar a Almacén" del
// catálogo. Muestra, de arriba a abajo:
//  1. El producto y cómo quedan Bodega y Almacén con la cantidad escrita
//     (se actualiza mientras se escribe).
//  2. Cantidad, con un botón para pasar todo lo de Bodega.
//  3. Operario responsable: se elige de los usuarios activos; arranca con el
//     usuario que tiene la sesión abierta.
//  4. Justificación (obligatoria).
//  5. Firma: el responsable confirma con una casilla qué entrega. Si cambia
//     la cantidad o el responsable, la casilla se desmarca, porque la firma
//     es sobre lo que decía la frase en ese momento.
// Al confirmar llama a registrarTraslado() (mock mientras no exista el
// endpoint). Igual que ConfirmarVenta, avisa por `onRegistrado`/`onCancelar`.

import { useEffect, useId, useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputNumber from "@/components/ui/InputNumber";
import Select from "@/components/ui/Select";
import Campo, { clasesControl, propsAccesibilidad } from "@/components/ui/Campo";
import { Spinner } from "@/components/ui/Spinner";
import type { Producto } from "@/components/catalogo/tipos";
import { listarUsuarios } from "@/lib/auth/authService";
import { leerIdUsuario } from "@/lib/auth/sesion";
import type { UsuarioListado } from "@/lib/auth/tipos";
import { ROLES, type Errores } from "@/lib/auth/validaciones";
import { mensajeErrorTraslado, registrarTraslado } from "@/lib/inventario/trasladosService";
import type { TrasladoRegistrado } from "@/lib/inventario/tipos";
import {
  JUSTIFICACION_MAXIMA,
  permiteDecimales,
  validarTraslado,
  type CampoTraslado,
} from "@/lib/inventario/validaciones";

const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
// "1 unidad", "5 unidades", "2 resmas", "1,5 kilogramos".
function unidadEnTexto(cantidad: number, unidad: string) {
  const palabra = unidad.toLowerCase();
  if (cantidad === 1) return palabra;
  return /[aeiou]$/.test(palabra) ? `${palabra}s` : `${palabra}es`;
}

const nombreRol = (codigo: string) => ROLES.find((r) => r.value === codigo)?.label ?? codigo;

interface FormularioTrasladoProps {
  producto: Producto;
  onRegistrado: (traslado: TrasladoRegistrado, responsable: string) => void;
  onCancelar: () => void;
}

export default function FormularioTraslado({
  producto,
  onRegistrado,
  onCancelar,
}: FormularioTrasladoProps) {
  const idJustificacion = useId();
  const [cantidadTexto, setCantidadTexto] = useState("");
  const [idResponsable, setIdResponsable] = useState<number | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [firmado, setFirmado] = useState(false);
  const [errores, setErrores] = useState<Errores<CampoTraslado>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Usuarios activos para elegir al responsable. null = cargando.
  const [usuarios, setUsuarios] = useState<UsuarioListado[] | null>(null);
  const [errorUsuarios, setErrorUsuarios] = useState("");
  useEffect(() => {
    let vigente = true;
    listarUsuarios()
      .then((lista) => {
        if (!vigente) return;
        const activos = lista.filter((u) => u.activo);
        setUsuarios(activos);
        const enSesion = leerIdUsuario();
        if (activos.some((u) => u.id === enSesion)) setIdResponsable(enSesion);
      })
      .catch(() => {
        if (!vigente) return;
        setUsuarios([]);
        setErrorUsuarios("No se pudo cargar la lista de usuarios. Cierra y vuelve a abrir el formulario.");
      });
    return () => {
      vigente = false;
    };
  }, []);

  const decimales = permiteDecimales(producto.unidadMedida);
  const cantidad = Number(cantidadTexto);
  const cantidadValida = cantidadTexto.trim() !== "" && cantidad > 0 && cantidad <= producto.stockBodega;
  const responsable = usuarios?.find((u) => u.id === idResponsable);

  const limpiarError = (campo: CampoTraslado) => {
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  const cambiarCantidad = (texto: string) => {
    setCantidadTexto(texto);
    setFirmado(false);
    limpiarError("cantidad");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const encontrados = validarTraslado(
      { cantidadTexto, idResponsable, justificacion, firmado },
      producto.stockBodega,
      producto.unidadMedida,
    );
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0 || idResponsable === null) return;

    setEnviando(true);
    setErrorGeneral("");
    try {
      const traslado = await registrarTraslado(
        { idProducto: producto.id, cantidad, idResponsable, justificacion },
        producto,
      );
      onRegistrado(traslado, responsable?.nombreCompleto ?? "");
    } catch (error) {
      setErrorGeneral(mensajeErrorTraslado(error));
      setEnviando(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {errorGeneral && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorGeneral}
        </p>
      )}

      {/* 1. Producto y cómo quedan las dos ubicaciones */}
      <section>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{producto.nombre}</p>
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {producto.codigo} · {producto.unidadMedida}
        </p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center" aria-live="polite">
          <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Bodega</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {formatoCantidad.format(producto.stockBodega)}
              {cantidadValida && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}→ {formatoCantidad.format(producto.stockBodega - cantidad)}
                </span>
              )}
            </p>
          </div>
          <span aria-hidden="true" className="text-xl text-zinc-400">→</span>
          <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Almacén</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {formatoCantidad.format(producto.stockAlmacen)}
              {cantidadValida && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {" "}→ {formatoCantidad.format(producto.stockAlmacen + cantidad)}
                </span>
              )}
            </p>
          </div>
        </div>
      </section>

      <fieldset disabled={enviando} className="space-y-4">
        {/* 2. Cantidad */}
        <div>
          <InputNumber
            label="Cantidad a trasladar"
            name="cantidad"
            required
            autoFocus
            min={decimales ? 0.001 : 1}
            max={producto.stockBodega}
            step={decimales ? 0.001 : 1}
            placeholder="0"
            value={cantidadTexto}
            onChange={(e) => cambiarCantidad(e.target.value)}
            error={errores.cantidad}
            hint={`Hay ${formatoCantidad.format(producto.stockBodega)} en Bodega.`}
          />
          <button
            type="button"
            onClick={() => cambiarCantidad(String(producto.stockBodega))}
            className="mt-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Pasar todo lo de Bodega ({formatoCantidad.format(producto.stockBodega)})
          </button>
        </div>

        {/* 3. Operario responsable */}
        {usuarios === null ? (
          // <div> y no <p>: el Spinner es un <div> y no puede ir dentro de un <p>.
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Spinner size="sm" color="gray" /> Cargando usuarios...
          </div>
        ) : (
          <Select
            label="Operario responsable (entrega la mercancía)"
            name="responsable"
            required
            placeholder="Elige un usuario"
            value={idResponsable === null ? "" : String(idResponsable)}
            options={usuarios.map((u) => ({
              value: String(u.id),
              label: `${u.nombreCompleto} — ${nombreRol(u.rol)}`,
            }))}
            onChange={(e) => {
              setIdResponsable(Number(e.target.value));
              setFirmado(false);
              limpiarError("responsable");
            }}
            error={errores.responsable || errorUsuarios || undefined}
          />
        )}

        {/* 4. Justificación. No hay un componente de área de texto en
            components/ui, así que se usa Campo con un <textarea>. */}
        <Campo
          idCampo={idJustificacion}
          label="Justificación"
          required
          error={errores.justificacion}
          hint={`${justificacion.trim().length}/${JUSTIFICACION_MAXIMA} · Ej: Surtir la vitrina para el fin de semana.`}
        >
          <textarea
            id={idJustificacion}
            name="justificacion"
            rows={3}
            maxLength={JUSTIFICACION_MAXIMA}
            value={justificacion}
            onChange={(e) => {
              setJustificacion(e.target.value);
              limpiarError("justificacion");
            }}
            {...propsAccesibilidad(idJustificacion, errores.justificacion, "hint")}
            className={`${clasesControl(Boolean(errores.justificacion))} resize-y px-3`}
          />
        </Campo>

        {/* 5. Firma del responsable */}
        <div>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
              errores.firma
                ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                : firmado
                  ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                  : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <input
              type="checkbox"
              name="firma"
              checked={firmado}
              disabled={!responsable || !cantidadValida}
              onChange={(e) => {
                setFirmado(e.target.checked);
                limpiarError("firma");
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
            />
            <span className="text-zinc-700 dark:text-zinc-300">
              {responsable && cantidadValida ? (
                <>
                  Yo, <strong>{responsable.nombreCompleto}</strong>, entrego{" "}
                  <strong>
                    {formatoCantidad.format(cantidad)} {unidadEnTexto(cantidad, producto.unidadMedida)}
                  </strong>{" "}
                  de {producto.nombre} de Bodega a Almacén.
                </>
              ) : (
                "Escribe la cantidad y elige al responsable para firmar el traslado."
              )}
            </span>
          </label>
          {errores.firma && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errores.firma}</p>
          )}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando || usuarios === null}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Registrando traslado...
            </>
          ) : (
            "Registrar traslado"
          )}
        </Button>
      </div>
    </form>
  );
}
