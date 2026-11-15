"use client";

// SCRUM-124 (Camilo) — Contenido del modal "Trasladar a Almacén" del
// catálogo.
//
// SCRUM-156 (Camilo) — Ahora va en DOS pasos, y nada se mueve hasta el final:
//  Paso 1 "datos": el producto con la vista previa de Bodega y Almacén, la
//    cantidad (con "Pasar todo lo de Bodega"), el operario responsable
//    (arranca con el usuario de la sesión) y la justificación. El botón
//    "Revisar traslado" valida esto y pasa al paso 2.
//  Paso 2 "confirmar": la ventana de confirmación. Muestra el resumen de lo
//    que se va a mover y pide la FIRMA del responsable: escribir su nombre
//    completo (tiene que coincidir con el elegido; no importan mayúsculas ni
//    tildes). Recién con "Confirmar y mover stock" se llama a
//    registrarTraslado(). "Corregir datos" vuelve al paso 1 sin perder lo
//    escrito, y borra la firma (firmó otra cosa).
// Antes la firma era una casilla en el mismo formulario. El paso en que
// está se le avisa a la página (`onCambiarPaso`) para cambiar el título del
// modal a "Confirmar traslado".

import { useEffect, useId, useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputNumber from "@/components/ui/InputNumber";
import InputText from "@/components/ui/InputText";
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
  errorFirmaTraslado,
  firmaCoincide,
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

export type PasoTraslado = "datos" | "confirmar";

// SCRUM-156 (Camilo) — Cómo quedan Bodega y Almacén. Se sacó a un componente
// porque ahora se muestra en los dos pasos.
function VistaPreviaUbicaciones({
  producto,
  cantidad,
}: {
  producto: Producto;
  /** null = todavía no hay una cantidad válida: solo se ve el stock actual. */
  cantidad: number | null;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center" aria-live="polite">
      <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Bodega</p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {formatoCantidad.format(producto.stockBodega)}
          {cantidad !== null && (
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
          {cantidad !== null && (
            <span className="text-emerald-600 dark:text-emerald-400">
              {" "}→ {formatoCantidad.format(producto.stockAlmacen + cantidad)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

interface FormularioTrasladoProps {
  producto: Producto;
  onRegistrado: (traslado: TrasladoRegistrado, responsable: string) => void;
  onCancelar: () => void;
  /** SCRUM-156 — Avisa cuando cambia de paso (la página cambia el título). */
  onCambiarPaso?: (paso: PasoTraslado) => void;
}

export default function FormularioTraslado({
  producto,
  onRegistrado,
  onCancelar,
  onCambiarPaso,
}: FormularioTrasladoProps) {
  const idJustificacion = useId();
  const [paso, setPaso] = useState<PasoTraslado>("datos");
  const [cantidadTexto, setCantidadTexto] = useState("");
  const [idResponsable, setIdResponsable] = useState<number | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [firma, setFirma] = useState("");
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
  const firmaValida = responsable ? firmaCoincide(firma, responsable.nombreCompleto) : false;
  // Quien tiene la sesión abierta, para avisar si registra a nombre de otro.
  const idEnSesion = leerIdUsuario();
  const registraOtro = responsable !== undefined && idEnSesion !== null && responsable.id !== idEnSesion;

  const irAPaso = (nuevo: PasoTraslado) => {
    setPaso(nuevo);
    setErrorGeneral("");
    onCambiarPaso?.(nuevo);
  };

  const limpiarError = (campo: CampoTraslado) => {
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  // Paso 1 → 2: solo valida los datos. No llama a la API.
  const revisar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const encontrados = validarTraslado(
      { cantidadTexto, idResponsable, justificacion },
      producto.stockBodega,
      producto.unidadMedida,
    );
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0 || !responsable) return;
    setFirma("");
    irAPaso("confirmar");
  };

  // Paso 2: revisa la firma y recién ahí mueve el stock.
  const confirmar = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando || !responsable || idResponsable === null) return;

    const errorDeFirma = errorFirmaTraslado(firma, responsable.nombreCompleto);
    setErrores(errorDeFirma ? { firma: errorDeFirma } : {});
    if (errorDeFirma) return;

    setEnviando(true);
    setErrorGeneral("");
    try {
      const traslado = await registrarTraslado(
        { idProducto: producto.id, cantidad, idResponsable, justificacion },
        producto,
      );
      onRegistrado(traslado, responsable.nombreCompleto);
    } catch (error) {
      setErrorGeneral(mensajeErrorTraslado(error));
      setEnviando(false);
    }
  };

  const avisoError = errorGeneral && (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {errorGeneral}
    </p>
  );

  // ---------------------------------------------------------------------
  // Paso 2: ventana de confirmación con la firma.
  // ---------------------------------------------------------------------
  if (paso === "confirmar" && responsable) {
    return (
      <form className="space-y-5" onSubmit={confirmar} noValidate>
        {avisoError}

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Revisa los datos. <strong className="text-zinc-900 dark:text-zinc-100">El stock no se mueve</strong>{" "}
          hasta que el responsable firme y confirmes.
        </p>

        {/* Resumen de lo que se va a mover */}
        <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{producto.nombre}</p>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{producto.codigo}</p>
            </div>
            <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              {formatoCantidad.format(cantidad)} {unidadEnTexto(cantidad, producto.unidadMedida)}
            </p>
          </div>
          <VistaPreviaUbicaciones producto={producto} cantidad={cantidad} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">Motivo</dt>
            <dd className="break-words text-zinc-800 dark:text-zinc-200">{justificacion.trim()}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Entrega</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              <strong>{responsable.nombreCompleto}</strong> — {nombreRol(responsable.rol)}
            </dd>
          </dl>
          {registraOtro && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Estás registrando el traslado a nombre de otra persona: {responsable.nombreCompleto} debe
              escribir su nombre para firmar.
            </p>
          )}
        </section>

        {/* Firma: el responsable escribe su nombre completo */}
        <div>
          <InputText
            label="Firma del responsable"
            name="firma"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={responsable.nombreCompleto}
            value={firma}
            disabled={enviando}
            onChange={(e) => {
              setFirma(e.target.value);
              limpiarError("firma");
            }}
            error={errores.firma}
            hint={`Escribe tu nombre completo tal como aparece: ${responsable.nombreCompleto}`}
            className={firmaValida ? "[&_input]:border-emerald-600 dark:[&_input]:border-emerald-500" : ""}
          />
          {firmaValida && !errores.firma && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
              Firma válida
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => irAPaso("datos")} disabled={enviando}>
            ← Corregir datos
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? (
              <>
                <Spinner size="sm" color="white" />
                Moviendo stock...
              </>
            ) : (
              "Confirmar y mover stock"
            )}
          </Button>
        </div>
      </form>
    );
  }

  // ---------------------------------------------------------------------
  // Paso 1: datos del traslado.
  // ---------------------------------------------------------------------
  return (
    <form className="space-y-5" onSubmit={revisar} noValidate>
      {avisoError}

      {/* 1. Producto y cómo quedan las dos ubicaciones */}
      <section>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{producto.nombre}</p>
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {producto.codigo} · {producto.unidadMedida}
        </p>
        <div className="mt-3">
          <VistaPreviaUbicaciones producto={producto} cantidad={cantidadValida ? cantidad : null} />
        </div>
      </section>

      <div className="space-y-4">
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
            onChange={(e) => {
              setCantidadTexto(e.target.value);
              limpiarError("cantidad");
            }}
            error={errores.cantidad}
            hint={`Hay ${formatoCantidad.format(producto.stockBodega)} en Bodega.`}
          />
          <button
            type="button"
            onClick={() => {
              setCantidadTexto(String(producto.stockBodega));
              limpiarError("cantidad");
            }}
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
      </div>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={usuarios === null}>
          Revisar traslado →
        </Button>
      </div>
    </form>
  );
}
