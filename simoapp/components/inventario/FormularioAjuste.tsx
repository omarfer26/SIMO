"use client";

// SCRUM-38 (Camilo) — Contenido del modal "Ajustar stock" del catálogo.
// Sirve para corregir el stock a mano cuando no cuadra con lo físico
// (producto dañado, vencido, perdido, sobrante en un conteo...). De arriba a
// abajo:
//  1. El producto y cómo quedan Bodega, Almacén y el total con el ajuste
//     (se actualiza mientras se llena).
//  2. Tipo: Entrada (+, AJUSTE_POSITIVO) o Salida (−, AJUSTE_NEGATIVO).
//  3. Ubicación: Bodega o Almacén.
//  4. Cantidad. En una salida no deja restar más de lo que hay ahí.
//  5. Justificación obligatoria (RF-10): queda en el Kardex y en la auditoría.
// Al confirmar llama a registrarAjuste() (mock mientras no exista el
// endpoint). Igual que FormularioTraslado, avisa por `onRegistrado`/`onCancelar`.

import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputNumber from "@/components/ui/InputNumber";
import Campo, { clasesControl, propsAccesibilidad } from "@/components/ui/Campo";
import { Spinner } from "@/components/ui/Spinner";
import type { Producto } from "@/components/catalogo/tipos";
import type { Errores } from "@/lib/auth/validaciones";
import { mensajeErrorAjuste, registrarAjuste } from "@/lib/inventario/ajustesService";
import type { AjusteRegistrado, TipoAjuste, Ubicacion } from "@/lib/inventario/tipos";
import {
  JUSTIFICACION_MAXIMA,
  NOMBRE_UBICACION,
  permiteDecimales,
  validarAjuste,
  type CampoAjuste,
} from "@/lib/inventario/validaciones";

const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const redondear = (valor: number) => Math.round(valor * 1000) / 1000;

const EJEMPLO_JUSTIFICACION: Record<TipoAjuste, string> = {
  AJUSTE_POSITIVO: "Ej: En el conteo físico aparecieron 2 unidades más que en el sistema.",
  AJUSTE_NEGATIVO: "Ej: 3 unidades llegaron con la caja rota y no se pueden vender.",
};

interface FormularioAjusteProps {
  producto: Producto;
  onRegistrado: (ajuste: AjusteRegistrado) => void;
  onCancelar: () => void;
}

export default function FormularioAjuste({ producto, onRegistrado, onCancelar }: FormularioAjusteProps) {
  const idJustificacion = useId();
  const [tipo, setTipo] = useState<TipoAjuste | null>(null);
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [errores, setErrores] = useState<Errores<CampoAjuste>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  const stock: Record<Ubicacion, number> = {
    BODEGA: producto.stockBodega,
    ALMACEN: producto.stockAlmacen,
  };
  const campos = { tipo, ubicacion, cantidadTexto, justificacion };
  const decimales = permiteDecimales(producto.unidadMedida);
  const cantidad = Number(cantidadTexto);

  // La vista previa solo se muestra cuando el ajuste ya tiene sentido: con
  // tipo, ubicación y una cantidad válida (las mismas reglas del envío).
  const cantidadValida =
    tipo !== null && ubicacion !== null && !validarAjuste(campos, stock, producto.unidadMedida).cantidad;
  const signo = tipo === "AJUSTE_NEGATIVO" ? -1 : 1;
  const despues = (lugar: Ubicacion) =>
    cantidadValida && ubicacion === lugar ? redondear(stock[lugar] + signo * cantidad) : null;

  const limpiarError = (campo: CampoAjuste) => {
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const encontrados = validarAjuste(campos, stock, producto.unidadMedida);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0 || tipo === null || ubicacion === null) return;

    setEnviando(true);
    setErrorGeneral("");
    try {
      const ajuste = await registrarAjuste(
        { idProducto: producto.id, tipo, ubicacion, cantidad, justificacion },
        producto,
      );
      onRegistrado(ajuste);
    } catch (error) {
      setErrorGeneral(mensajeErrorAjuste(error));
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

      {/* 1. Producto y cómo queda el stock */}
      <section>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{producto.nombre}</p>
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {producto.codigo} · {producto.unidadMedida}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center" aria-live="polite">
          <Saldo titulo="Bodega" antes={stock.BODEGA} despues={despues("BODEGA")} signo={signo} />
          <Saldo titulo="Almacén" antes={stock.ALMACEN} despues={despues("ALMACEN")} signo={signo} />
          <Saldo
            titulo="Total"
            antes={producto.stockActual}
            despues={cantidadValida ? redondear(producto.stockActual + signo * cantidad) : null}
            signo={signo}
            resaltado
          />
        </div>
      </section>

      <fieldset disabled={enviando} className="space-y-4">
        {/* 2. Tipo de ajuste */}
        <GrupoOpciones titulo="Tipo de ajuste" error={errores.tipo}>
          <Opcion
            name="tipo"
            checked={tipo === "AJUSTE_POSITIVO"}
            onChange={() => {
              setTipo("AJUSTE_POSITIVO");
              limpiarError("tipo");
              limpiarError("cantidad");
            }}
            titulo="+ Entrada"
            detalle="Suma stock: sobrante en un conteo, mercancía encontrada."
            color="emerald"
          />
          <Opcion
            name="tipo"
            checked={tipo === "AJUSTE_NEGATIVO"}
            onChange={() => {
              setTipo("AJUSTE_NEGATIVO");
              limpiarError("tipo");
              limpiarError("cantidad");
            }}
            titulo="− Salida"
            detalle="Resta stock: producto dañado, vencido, perdido o faltante."
            color="red"
          />
        </GrupoOpciones>

        {/* 3. Ubicación */}
        <GrupoOpciones titulo="Ubicación" error={errores.ubicacion}>
          {(["BODEGA", "ALMACEN"] as const).map((lugar) => (
            <Opcion
              key={lugar}
              name="ubicacion"
              checked={ubicacion === lugar}
              onChange={() => {
                setUbicacion(lugar);
                limpiarError("ubicacion");
                limpiarError("cantidad");
              }}
              titulo={NOMBRE_UBICACION[lugar]}
              detalle={`Hay ${formatoCantidad.format(stock[lugar])} ahora.`}
              color="emerald"
            />
          ))}
        </GrupoOpciones>

        {/* 4. Cantidad */}
        <InputNumber
          label="Cantidad a ajustar"
          name="cantidad"
          required
          min={decimales ? 0.001 : 1}
          max={tipo === "AJUSTE_NEGATIVO" && ubicacion ? stock[ubicacion] : undefined}
          step={decimales ? 0.001 : 1}
          placeholder="0"
          value={cantidadTexto}
          onChange={(e) => {
            setCantidadTexto(e.target.value);
            limpiarError("cantidad");
          }}
          error={errores.cantidad}
          hint={
            tipo === "AJUSTE_NEGATIVO" && ubicacion
              ? `Puedes restar hasta ${formatoCantidad.format(stock[ubicacion])} de ${NOMBRE_UBICACION[ubicacion]}.`
              : `Siempre en positivo; el tipo de ajuste dice si suma o resta. Unidad: ${producto.unidadMedida.toLowerCase()}.`
          }
        />

        {/* 5. Justificación. No hay componente de área de texto en
            components/ui, así que se usa Campo con un <textarea> (igual que
            en FormularioTraslado). */}
        <Campo
          idCampo={idJustificacion}
          label="Justificación"
          required
          error={errores.justificacion}
          hint={`${justificacion.trim().length}/${JUSTIFICACION_MAXIMA} · ${
            tipo ? EJEMPLO_JUSTIFICACION[tipo] : "Explica por qué el stock no cuadra."
          }`}
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
      </fieldset>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        El ajuste queda en el Kardex y en la auditoría con tu usuario, la fecha y la justificación. No se
        puede borrar.
      </p>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" variant={tipo === "AJUSTE_NEGATIVO" ? "danger" : "primary"} disabled={enviando}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Registrando ajuste...
            </>
          ) : cantidadValida && ubicacion ? (
            `Registrar ajuste (${signo > 0 ? "+" : "−"}${formatoCantidad.format(cantidad)} en ${NOMBRE_UBICACION[ubicacion]})`
          ) : (
            "Registrar ajuste"
          )}
        </Button>
      </div>
    </form>
  );
}

// Cajita con el saldo de una ubicación y, si el ajuste la toca, cómo queda.
function Saldo({
  titulo,
  antes,
  despues,
  signo,
  resaltado = false,
}: {
  titulo: string;
  antes: number;
  despues: number | null;
  signo: number;
  resaltado?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-2 py-2 ${
        resaltado ? "border border-zinc-200 dark:border-zinc-700" : "bg-zinc-50 dark:bg-zinc-800/50"
      }`}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{titulo}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {formatoCantidad.format(antes)}
        {despues !== null && (
          <span className={signo > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {" "}→ {formatoCantidad.format(despues)}
          </span>
        )}
      </p>
    </div>
  );
}

// Grupo de opciones tipo tarjeta (radio buttons) con su título y su error.
function GrupoOpciones({ titulo, error, children }: { titulo: string; error?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {titulo}
        <span className="ml-0.5 text-red-600" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const COLOR_ELEGIDO = {
  emerald: "has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:has-[:checked]:border-emerald-500 dark:has-[:checked]:bg-emerald-950/40",
  red: "has-[:checked]:border-red-600 has-[:checked]:bg-red-50 dark:has-[:checked]:border-red-500 dark:has-[:checked]:bg-red-950/40",
};

function Opcion({
  name,
  checked,
  onChange,
  titulo,
  detalle,
  color,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  titulo: string;
  detalle: string;
  color: keyof typeof COLOR_ELEGIDO;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 dark:border-zinc-700 ${COLOR_ELEGIDO[color]}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className={`mt-0.5 h-4 w-4 shrink-0 ${color === "red" ? "accent-red-600" : "accent-emerald-600"}`}
      />
      <span>
        <span className="block font-medium text-zinc-900 dark:text-zinc-100">{titulo}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{detalle}</span>
      </span>
    </label>
  );
}
