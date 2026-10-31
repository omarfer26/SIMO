"use client";

// SCRUM-59 (Camilo) — Contenido del modal "Convertir pedido en venta" (HU-12).
// Un pedido ENTREGADO pasa a ser una venta con un clic en "Confirmar venta",
// sin volver a escribir los productos en el POS: la venta toma el cliente,
// los productos y los precios del pedido. Aquí solo se elige cómo pagó el
// cliente (obligatorio, arranca sin ninguno a propósito, como en el POS) y
// un descuento opcional.
// No descuenta stock: ya salió del inventario al pasar el pedido a
// "En preparación" (RN-02).
// Si falla, muestra el error arriba sin cerrar el modal, para reintentar.

import { useState, type SubmitEvent } from "react";
import Button from "@/components/ui/Button";
import InputNumber from "@/components/ui/InputNumber";
import { Spinner } from "@/components/ui/Spinner";
import SelectorMetodoPago from "@/components/ventas/SelectorMetodoPago";
import type { Errores } from "@/lib/auth/validaciones";
import { convertirPedidoEnVenta, mensajeErrorConversion } from "@/lib/pedidos/pedidosService";
import type { Pedido, VentaDePedido } from "@/lib/pedidos/tipos";
import { validarConversion, type CampoConversion } from "@/lib/pedidos/validaciones";
import type { CodigoMetodoPago } from "@/lib/ventas/tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

interface ConvertirPedidoEnVentaProps {
  pedido: Pedido;
  onConvertida: (venta: VentaDePedido) => void;
  onCancelar: () => void;
}

export default function ConvertirPedidoEnVenta({
  pedido,
  onConvertida,
  onCancelar,
}: ConvertirPedidoEnVentaProps) {
  const [metodoPago, setMetodoPago] = useState<CodigoMetodoPago | null>(null);
  const [descuentoTexto, setDescuentoTexto] = useState("");
  const [errores, setErrores] = useState<Errores<CampoConversion>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  // El error del descuento se ve en vivo (porque cambia el total); el del
  // método, solo después de intentar confirmar.
  const erroresEnVivo = validarConversion({
    metodoPago,
    descuentoTexto,
    totalPedido: pedido.total,
  });
  // En pesos enteros, como el POS. Un descuento inválido no se resta.
  const descuento = erroresEnVivo.descuento ? 0 : Math.round(Number(descuentoTexto) || 0);
  const total = pedido.total - descuento;

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    setErrores(erroresEnVivo);
    if (Object.keys(erroresEnVivo).length > 0 || !metodoPago) return;

    setEnviando(true);
    setErrorGeneral("");
    try {
      onConvertida(await convertirPedidoEnVenta(pedido.id, { metodoPago, descuento }));
    } catch (error) {
      setErrorGeneral(mensajeErrorConversion(error));
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

      {/* 1. Resumen del pedido */}
      <section className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-zinc-500 dark:text-zinc-400">Cliente</dt>
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">{pedido.cliente}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Entrega pactada</dt>
          <dd className="text-zinc-900 dark:text-zinc-100">
            {formatoFecha.format(pedido.fechaEntregaPactada)}
          </dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Registrado por</dt>
          <dd className="text-zinc-900 dark:text-zinc-100">{pedido.registradoPor}</dd>
        </dl>
        <p className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          La venta lleva los mismos productos y precios del pedido. El stock no
          se descuenta otra vez: ya salió al preparar el pedido.
        </p>
      </section>

      {/* 2. Método de pago */}
      <SelectorMetodoPago
        valor={metodoPago}
        onCambiar={(codigo) => {
          setMetodoPago(codigo);
          setErrores((previo) => ({ ...previo, metodoPago: undefined }));
          setErrorGeneral("");
        }}
        disabled={enviando}
        error={errores.metodoPago}
      />

      {/* 3. Descuento y total */}
      <section className="space-y-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <InputNumber
          label="Descuento (opcional)"
          name="descuento"
          min={0}
          max={pedido.total}
          step={100}
          placeholder="0"
          disabled={enviando}
          value={descuentoTexto}
          onChange={(e) => {
            setDescuentoTexto(e.target.value);
            setErrorGeneral("");
          }}
          error={erroresEnVivo.descuento}
          hint="En pesos. Se resta del total del pedido."
        />

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
            <dt>Total del pedido</dt>
            <dd>{formatoMoneda.format(pedido.total)}</dd>
          </div>
          {descuento > 0 && (
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <dt>Descuento</dt>
              <dd>− {formatoMoneda.format(descuento)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Total de la venta</dt>
            <dd className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatoMoneda.format(total)}
            </dd>
          </div>
          <p className="text-right text-xs text-zinc-500 dark:text-zinc-400">IVA incluido</p>
        </dl>
      </section>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        {/* No se deshabilita cuando falta algo: al hacer clic se muestra qué falta. */}
        <Button type="submit" disabled={enviando}>
          {enviando ? (
            <>
              <Spinner size="sm" color="white" />
              Registrando venta...
            </>
          ) : (
            `Confirmar venta · ${formatoMoneda.format(total)}`
          )}
        </Button>
      </div>
    </form>
  );
}
