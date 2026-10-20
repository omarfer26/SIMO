"use client";

// SCRUM-50 (Camilo) — Contenido del modal "Confirmar venta" del POS. Muestra,
// de arriba a abajo:
//  1. El resumen de la canasta (producto, cantidad × precio, subtotal).
//  2. Los 6 métodos de pago para elegir uno (Efectivo, Nequi, Daviplata...).
//     Arranca sin ninguno elegido, a propósito: así el vendedor tiene que
//     escoger y no queda "Efectivo" registrado por descuido.
//  3. La liquidación: subtotal, descuento opcional en pesos y total. Los
//     precios ya incluyen IVA, así que no se suma impuesto aparte.
//  4. Solo en Efectivo: con cuánto paga el cliente (con botones rápidos) y el
//     cambio que hay que devolverle. No deja confirmar si no alcanza.
// Al confirmar llama a registrarVenta() (mock mientras no exista el backend),
// muestra "Registrando venta..." y, si falla, el error arriba sin cerrar el
// modal, para poder corregir o reintentar.
//
// Igual que los formularios de usuarios, no sabe nada del modal que lo
// envuelve: avisa por `onConfirmada` y `onCancelar`.

import { useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputNumber from "@/components/ui/InputNumber";
import { Spinner } from "@/components/ui/Spinner";
import {
  calcularLiquidacion,
  sugerenciasEfectivo,
  validarLiquidacion,
  type ErroresLiquidacion,
} from "@/lib/ventas/liquidacion";
import {
  METODOS_PAGO,
  type CodigoMetodoPago,
  type ItemCanasta,
  type VentaRegistrada,
} from "@/lib/ventas/tipos";
import { mensajeErrorVenta, registrarVenta } from "@/lib/ventas/ventasService";
import type { Cliente } from "@/lib/clientes/tipos";
import { formatoDocumento } from "@/lib/clientes/validaciones";
import type { UsuarioListado } from "@/lib/auth/tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export interface InfoLiquidacionVenta {
  metodoPago: CodigoMetodoPago;
  subtotal: number;
  descuento: number;
  impuestos: number;
  total: number;
  recibido: number;
  cambio: number;
}

interface ConfirmarVentaProps {
  items: ItemCanasta[];
  /** SCRUM-123 (Camilo) — Cliente elegido en el POS; null = Consumidor final. */
  cliente: Cliente | null;
  /** Cajero / Vendedor en turno */
  cajero?: UsuarioListado | null;
  /** `cambio` va aparte porque no se guarda en el backend, solo se muestra. */
  onConfirmada: (venta: VentaRegistrada, cambio: number, info?: InfoLiquidacionVenta) => void;
  onCancelar: () => void;
}

export default function ConfirmarVenta({
  items,
  cliente,
  cajero,
  onConfirmada,
  onCancelar,
}: ConfirmarVentaProps) {
  const [metodoPago, setMetodoPago] = useState<CodigoMetodoPago | null>(null);
  // Los dos campos numéricos se guardan como texto, tal como se escriben,
  // para poder distinguir "vacío" de "0" al validar.
  const [descuentoTexto, setDescuentoTexto] = useState("");
  const [recibidoTexto, setRecibidoTexto] = useState("");
  const [errores, setErrores] = useState<ErroresLiquidacion>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  const esEfectivo = metodoPago === "EFECTIVO";
  const liquidacion = calcularLiquidacion(
    items,
    Number(descuentoTexto) || 0,
    esEfectivo ? Number(recibidoTexto) || 0 : 0,
  );
  const unidades = items.reduce((suma, item) => suma + item.cantidad, 0);

  // Se valida en cada cambio. El error del descuento se muestra en vivo
  // (porque cambia el total); los demás solo después de intentar confirmar,
  // para no llenar de rojo el modal apenas se abre.
  const erroresEnVivo = validarLiquidacion({
    metodoPago,
    descuentoTexto,
    recibidoTexto,
    subtotal: liquidacion.subtotal,
    total: liquidacion.total,
  });
  const listo = Object.keys(erroresEnVivo).length === 0;

  const limpiarError = (campo: keyof ErroresLiquidacion) => {
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    setErrores(erroresEnVivo);
    if (!listo || !metodoPago) return;

    setEnviando(true);
    setErrorGeneral("");
    try {
      const venta = await registrarVenta({
        metodoPago,
        idCliente: cliente?.id ?? null,
        idVendedor: cajero?.id ?? null,
        items,
        subtotal: liquidacion.subtotal,
        descuento: liquidacion.descuento,
        impuestos: liquidacion.impuestos,
        total: liquidacion.total,
      });
      onConfirmada(venta, esEfectivo ? liquidacion.cambio : 0, {
        metodoPago,
        subtotal: liquidacion.subtotal,
        descuento: liquidacion.descuento,
        impuestos: liquidacion.impuestos,
        total: liquidacion.total,
        recibido: esEfectivo ? Number(recibidoTexto) || 0 : 0,
        cambio: esEfectivo ? liquidacion.cambio : 0,
      });
    } catch (error) {
      setErrorGeneral(mensajeErrorVenta(error));
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

      {/* 1. Resumen de la canasta */}
      <section>
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Resumen ({items.length} {items.length === 1 ? "producto" : "productos"},{" "}
          {unidades} {unidades === 1 ? "unidad" : "unidades"})
        </h4>
        <ul className="mt-2 max-h-40 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map((item) => (
            <li
              key={item.producto.id}
              className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {item.producto.nombre}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.cantidad} × {formatoMoneda.format(item.producto.precioVenta)}
                </p>
              </div>
              <span className="shrink-0 font-medium text-zinc-900 dark:text-zinc-100">
                {formatoMoneda.format(item.producto.precioVenta * item.cantidad)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* SCRUM-123 (Camilo) — Datos del cliente para la factura, tomados
          automáticamente del cliente elegido en el POS. */}
      <section className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
        <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Facturar a
        </h4>
        {cliente ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-zinc-500 dark:text-zinc-400">Nombre</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">{cliente.nombre}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">{cliente.tipoDocumento}</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{formatoDocumento(cliente.documento)}</dd>
            {cliente.telefono && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Teléfono</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{cliente.telefono}</dd>
              </>
            )}
            {cliente.correo && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Correo</dt>
                <dd className="break-all text-zinc-900 dark:text-zinc-100">{cliente.correo}</dd>
              </>
            )}
            {cliente.direccion && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Dirección</dt>
                <dd className="text-zinc-900 dark:text-zinc-100">{cliente.direccion}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            Consumidor final{" "}
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              (para facturar a alguien, vuelve a la canasta y busca su Cédula/NIT)
            </span>
          </p>
        )}
      </section>

      {/* Cajero / Vendedor en turno */}
      {cajero && (
        <section className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {cajero.nombreCompleto.charAt(0)}
            </span>
            <div className="text-xs">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Atendido por: {cajero.nombreCompleto}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400"> (@{cajero.usuario})</span>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            {cajero.rol}
          </span>
        </section>
      )}

      {/* 2. Método de pago: radios de verdad (accesibles con teclado y
          lector de pantalla), con el círculo escondido y la tarjeta entera
          como zona para hacer clic. */}
      <fieldset disabled={enviando}>
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Método de pago <span className="text-red-500">*</span>
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {METODOS_PAGO.map((metodo) => {
            const elegido = metodoPago === metodo.codigo;
            return (
              <label
                key={metodo.codigo}
                className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
                  elegido
                    ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  name="metodoPago"
                  value={metodo.codigo}
                  checked={elegido}
                  onChange={() => {
                    setMetodoPago(metodo.codigo);
                    limpiarError("metodoPago");
                    limpiarError("recibido");
                  }}
                  className="sr-only"
                />
                <span
                  className={`block text-sm font-medium ${
                    elegido
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {metodo.nombre}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {metodo.descripcion}
                </span>
              </label>
            );
          })}
        </div>
        {errores.metodoPago && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errores.metodoPago}</p>
        )}
        {metodoPago && !esEfectivo && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Verifica que el pago haya llegado antes de confirmar: el sistema solo
            registra el método, no se conecta con el banco ni con la app.
          </p>
        )}
      </fieldset>

      {/* 3. Liquidación */}
      <section className="space-y-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <InputNumber
          label="Descuento (opcional)"
          name="descuento"
          min={0}
          max={liquidacion.subtotal}
          step={100}
          placeholder="0"
          disabled={enviando}
          value={descuentoTexto}
          onChange={(e) => {
            setDescuentoTexto(e.target.value);
            limpiarError("descuento");
          }}
          error={erroresEnVivo.descuento}
          hint="En pesos. Se resta del subtotal."
        />

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
            <dt>Subtotal</dt>
            <dd>{formatoMoneda.format(liquidacion.subtotal)}</dd>
          </div>
          {liquidacion.descuento > 0 && (
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <dt>Descuento</dt>
              <dd>− {formatoMoneda.format(liquidacion.descuento)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Total a cobrar</dt>
            <dd className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatoMoneda.format(liquidacion.total)}
            </dd>
          </div>
          <p className="text-right text-xs text-zinc-500 dark:text-zinc-400">IVA incluido</p>
        </dl>
      </section>

      {/* 4. Efectivo: con cuánto paga y el cambio */}
      {esEfectivo && (
        <section className="space-y-3">
          <InputNumber
            label="Recibido en efectivo"
            name="recibido"
            min={0}
            step={100}
            placeholder={String(liquidacion.total)}
            required
            disabled={enviando}
            value={recibidoTexto}
            onChange={(e) => {
              setRecibidoTexto(e.target.value);
              limpiarError("recibido");
            }}
            error={errores.recibido}
          />
          <div className="flex flex-wrap gap-2">
            {sugerenciasEfectivo(liquidacion.total).map((valor, i) => (
              <button
                key={valor}
                type="button"
                disabled={enviando}
                onClick={() => {
                  setRecibidoTexto(String(valor));
                  limpiarError("recibido");
                }}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition-colors enabled:hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
              >
                {i === 0 ? `Exacto (${formatoMoneda.format(valor)})` : formatoMoneda.format(valor)}
              </button>
            ))}
          </div>
          {recibidoTexto.trim() !== "" && (
            <div
              aria-live="polite"
              className={`flex items-baseline justify-between rounded-lg px-4 py-3 ${
                liquidacion.faltante > 0
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              }`}
            >
              <span className="text-sm font-medium">
                {liquidacion.faltante > 0 ? "Faltan" : "Cambio a devolver"}
              </span>
              <span className="text-xl font-bold">
                {formatoMoneda.format(
                  liquidacion.faltante > 0 ? liquidacion.faltante : liquidacion.cambio,
                )}
              </span>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Volver a la canasta
        </Button>
        {/* No se deshabilita cuando falta algo: al hacer clic se muestra
            qué falta (por ejemplo, "Elige cómo paga el cliente"). */}
        <Button type="submit" disabled={enviando}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Registrando venta...
            </>
          ) : (
            `Confirmar venta · ${formatoMoneda.format(liquidacion.total)}`
          )}
        </Button>
      </div>
    </form>
  );
}
