"use client";

// SCRUM-57 (Camilo) — Contenido del modal "Nuevo pedido" de /pedidos. Sirve
// para registrar el pedido que hace un cliente (HU-10): el pedido nace en
// estado "Registrado" y después avanza en el tablero. De arriba a abajo:
//  1. Cliente: el mismo buscador del POS (BuscarCliente) y, si no existe,
//     el mismo formulario para registrarlo (FormularioClienteNuevo).
//  2. Productos: buscador del catálogo y la lista con la cantidad de cada
//     uno, su subtotal y un aviso si hoy no alcanza el stock (no bloquea:
//     el stock se descuenta al pasar a "En preparación", RN-02).
//  3. Entrega: fecha pactada (obligatoria, desde hoy), dirección y
//     observaciones (opcionales).
//  4. Total estimado y botón "Registrar pedido".
// La sección del cliente queda por fuera del <form> del pedido a propósito:
// FormularioClienteNuevo es otro <form>, y HTML no deja meter un formulario
// dentro de otro.

import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { useProductos } from "@/components/catalogo/ProductosContext";
import type { Producto } from "@/components/catalogo/tipos";
import Button from "@/components/ui/Button";
import Campo, { clasesControl, propsAccesibilidad } from "@/components/ui/Campo";
import InputNumber from "@/components/ui/InputNumber";
import InputText from "@/components/ui/InputText";
import { Spinner } from "@/components/ui/Spinner";
import BuscarCliente from "@/components/ventas/BuscarCliente";
import FormularioClienteNuevo from "@/components/ventas/FormularioClienteNuevo";
import type { Errores } from "@/lib/auth/validaciones";
import { recordarCliente } from "@/lib/clientes/clientesRecientes";
import type { Cliente } from "@/lib/clientes/tipos";
import { formatoDocumento } from "@/lib/clientes/validaciones";
import { permiteDecimales } from "@/lib/inventario/validaciones";
import { mensajeErrorRegistro, registrarPedido } from "@/lib/pedidos/pedidosService";
import type { PedidoRegistrado } from "@/lib/pedidos/tipos";
import {
  DIRECCION_MAXIMA,
  MAXIMO_LINEAS,
  OBSERVACIONES_MAXIMA,
  errorCantidadLinea,
  hoyComoTexto,
  validarPedido,
  type CampoPedido,
} from "@/lib/pedidos/validaciones";
import AgregarProductoPedido from "./AgregarProductoPedido";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

// Un producto dentro del pedido. La cantidad se guarda como texto, tal como
// sale del campo, y se convierte al validar.
interface LineaFormulario {
  producto: Producto;
  cantidadTexto: string;
}

interface FormularioPedidoProps {
  onRegistrado: (resultado: PedidoRegistrado) => void;
  onCancelar: () => void;
}

export default function FormularioPedido({ onRegistrado, onCancelar }: FormularioPedidoProps) {
  const idObservaciones = useId();
  const { productos, origen } = useProductos();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  // null = buscador; texto = formulario de cliente nuevo con lo que se buscó.
  const [registrandoCliente, setRegistrandoCliente] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaFormulario[]>([]);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [direccion, setDireccion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [errores, setErrores] = useState<Errores<CampoPedido>>({});
  const [erroresCantidad, setErroresCantidad] = useState<Record<number, string>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  const limpiarError = (campo: CampoPedido) => {
    setErrores((previo) => ({ ...previo, [campo]: undefined }));
    setErrorGeneral("");
  };

  // Subtotal de una línea, o null si su cantidad todavía no es válida.
  const subtotal = (linea: LineaFormulario) =>
    errorCantidadLinea(linea.cantidadTexto, linea.producto.unidadMedida)
      ? null
      : Math.round(Number(linea.cantidadTexto) * linea.producto.precioVenta * 100) / 100;
  const total = lineas.reduce((suma, linea) => suma + (subtotal(linea) ?? 0), 0);

  const elegirCliente = (elegido: Cliente) => {
    recordarCliente(elegido);
    setCliente(elegido);
    setRegistrandoCliente(null);
    limpiarError("cliente");
    // La dirección del cliente como punto de partida, si no se escribió otra.
    if (!direccion.trim() && elegido.direccion) setDireccion(elegido.direccion);
  };

  const agregarProducto = (producto: Producto) => {
    setLineas((previas) => {
      const existente = previas.find((l) => l.producto.id === producto.id);
      if (!existente) return [...previas, { producto, cantidadTexto: "1" }];
      return previas.map((l) =>
        l.producto.id === producto.id
          ? { ...l, cantidadTexto: String(Math.floor(Number(l.cantidadTexto) || 0) + 1) }
          : l,
      );
    });
    setErroresCantidad((previo) => ({ ...previo, [producto.id]: "" }));
    limpiarError("lineas");
  };

  const cambiarCantidad = (idProducto: number, cantidadTexto: string) => {
    setLineas((previas) =>
      previas.map((l) => (l.producto.id === idProducto ? { ...l, cantidadTexto } : l)),
    );
    setErroresCantidad((previo) => ({ ...previo, [idProducto]: "" }));
    setErrorGeneral("");
  };

  const quitarProducto = (idProducto: number) => {
    setLineas((previas) => previas.filter((l) => l.producto.id !== idProducto));
    setErrorGeneral("");
  };

  const handleSubmit = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;

    const resultado = validarPedido({
      idCliente: cliente?.id ?? null,
      lineas: lineas.map((l) => ({
        idProducto: l.producto.id,
        cantidadTexto: l.cantidadTexto,
        unidadMedida: l.producto.unidadMedida,
      })),
      fechaEntrega,
      direccion,
      observaciones,
    });
    setErrores(resultado.errores);
    setErroresCantidad(resultado.erroresCantidad);
    const hayErrores =
      Object.keys(resultado.errores).length > 0 || Object.keys(resultado.erroresCantidad).length > 0;
    if (hayErrores || cliente === null) {
      setErrorGeneral("Revisa los campos marcados en rojo.");
      return;
    }

    setEnviando(true);
    setErrorGeneral("");
    try {
      const registrado = await registrarPedido({
        idCliente: cliente.id,
        nombreCliente: cliente.nombre,
        fechaEntregaPactada: fechaEntrega,
        direccionEntrega: direccion,
        observaciones,
        lineas: lineas.map((l) => ({
          idProducto: l.producto.id,
          cantidad: Number(l.cantidadTexto),
          precioUnitario: l.producto.precioVenta,
        })),
      });
      onRegistrado(registrado);
    } catch (error) {
      setErrorGeneral(mensajeErrorRegistro(error));
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorGeneral && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {errorGeneral}
        </p>
      )}

      {/* 1. Cliente (fuera del <form>, ver comentario de arriba) */}
      <Seccion numero={1} titulo="Cliente">
        {cliente ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="min-w-0">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{cliente.nombre}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {cliente.tipoDocumento} {formatoDocumento(cliente.documento)}
                {cliente.telefono && ` · ${cliente.telefono}`}
              </p>
              {cliente.direccion && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{cliente.direccion}</p>
              )}
            </div>
            <Button
              variant="secondary"
              className="h-auto shrink-0 px-2.5 py-1 text-xs"
              onClick={() => setCliente(null)}
              disabled={enviando}
            >
              Cambiar
            </Button>
          </div>
        ) : registrandoCliente === null ? (
          <BuscarCliente onSeleccionar={elegirCliente} onRegistrarNuevo={setRegistrandoCliente} />
        ) : (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">Registrar cliente nuevo</p>
            <FormularioClienteNuevo
              textoBuscado={registrandoCliente}
              onRegistrado={elegirCliente}
              onVolver={() => setRegistrandoCliente(null)}
            />
          </div>
        )}
        {errores.cliente && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errores.cliente}
          </p>
        )}
      </Seccion>

      <form className="space-y-6" onSubmit={handleSubmit} noValidate>
        <fieldset disabled={enviando} className="space-y-6">
          {/* 2. Productos */}
          <Seccion numero={2} titulo="Productos">
            {origen === "cargando" ? (
              <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <Spinner size="sm" color="gray" /> Cargando el catálogo...
              </p>
            ) : (
              <>
                {origen === "respaldo" && (
                  <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    El catálogo del servidor no respondió y se están mostrando productos de prueba. El pedido
                    puede fallar al guardarse.
                  </p>
                )}
                <AgregarProductoPedido
                  productos={productos}
                  agregados={lineas.map((l) => l.producto.id)}
                  onAgregar={agregarProducto}
                  error={errores.lineas}
                />
              </>
            )}

            {lineas.length > 0 ? (
              <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {lineas.map((linea) => (
                  <LineaProducto
                    key={linea.producto.id}
                    linea={linea}
                    subtotal={subtotal(linea)}
                    error={erroresCantidad[linea.producto.id]}
                    onCambiar={(texto) => cambiarCantidad(linea.producto.id, texto)}
                    onQuitar={() => quitarProducto(linea.producto.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Todavía no hay productos en el pedido. Búscalos arriba por nombre o código.
              </p>
            )}
            {lineas.length > 0 && (
              <p className="mt-1 text-right text-xs text-zinc-500 dark:text-zinc-400">
                {lineas.length} de máximo {MAXIMO_LINEAS} productos distintos
              </p>
            )}
          </Seccion>

          {/* 3. Entrega */}
          <Seccion numero={3} titulo="Entrega">
            <div className="grid gap-4 sm:grid-cols-2">
              <InputText
                type="date"
                name="fechaEntrega"
                label="Fecha de entrega pactada"
                required
                min={hoyComoTexto()}
                value={fechaEntrega}
                onChange={(e) => {
                  setFechaEntrega(e.target.value);
                  limpiarError("fechaEntrega");
                }}
                error={errores.fechaEntrega}
                hint="El día que se acordó con el cliente. Desde hoy en adelante."
              />
              <InputText
                name="direccion"
                label="Dirección de entrega"
                placeholder="Opcional. Ej: Local 214, Centro Comercial Alejandría"
                maxLength={DIRECCION_MAXIMA}
                value={direccion}
                onChange={(e) => {
                  setDireccion(e.target.value);
                  limpiarError("direccion");
                }}
                error={errores.direccion}
                hint={cliente?.direccion ? "Se llenó con la del cliente; puedes cambiarla." : "Opcional."}
              />
            </div>

            {/* No hay área de texto en components/ui: Campo + <textarea>,
                igual que en FormularioAjuste. */}
            <Campo
              idCampo={idObservaciones}
              label="Observaciones"
              error={errores.observaciones}
              hint={`${observaciones.trim().length}/${OBSERVACIONES_MAXIMA} · Opcional. Ej: Empacar para regalo, llamar antes de llevarlo.`}
              className="mt-4"
            >
              <textarea
                id={idObservaciones}
                name="observaciones"
                rows={2}
                maxLength={OBSERVACIONES_MAXIMA}
                value={observaciones}
                onChange={(e) => {
                  setObservaciones(e.target.value);
                  limpiarError("observaciones");
                }}
                {...propsAccesibilidad(idObservaciones, errores.observaciones, "hint")}
                className={`${clasesControl(Boolean(errores.observaciones))} resize-y px-3`}
              />
            </Campo>
          </Seccion>
        </fieldset>

        {/* 4. Total y botones */}
        <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div aria-live="polite">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Total estimado</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatoMoneda.format(total)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Con el precio de venta vigente. El pedido queda en estado «Registrado».
            </p>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? (
                <>
                  <Spinner size="sm" color="white" />
                  Registrando pedido...
                </>
              ) : (
                "Registrar pedido"
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Título numerado de cada parte del formulario.
function Seccion({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
          {numero}
        </span>
        {titulo}
      </h4>
      {children}
    </section>
  );
}

// Un producto del pedido: nombre, precio, cantidad, subtotal y botón quitar.
function LineaProducto({
  linea,
  subtotal,
  error,
  onCambiar,
  onQuitar,
}: {
  linea: LineaFormulario;
  subtotal: number | null;
  error?: string;
  onCambiar: (texto: string) => void;
  onQuitar: () => void;
}) {
  const { producto, cantidadTexto } = linea;
  const decimales = permiteDecimales(producto.unidadMedida);
  const faltaStock = subtotal !== null && Number(cantidadTexto) > producto.stockActual;

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{producto.nombre}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-mono">{producto.codigo}</span> · {formatoMoneda.format(producto.precioVenta)} c/u ·{" "}
          {producto.unidadMedida}
        </p>
        {faltaStock && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Hoy hay {formatoCantidad.format(producto.stockActual)} en total (Bodega + Almacén). Se puede registrar,
            pero habrá que reponer antes de prepararlo.
          </p>
        )}
      </div>
      <InputNumber
        aria-label={`Cantidad de ${producto.nombre}`}
        name={`cantidad-${producto.id}`}
        min={decimales ? 0.001 : 1}
        step={decimales ? 0.001 : 1}
        value={cantidadTexto}
        onChange={(e) => onCambiar(e.target.value)}
        error={error || undefined}
        className="w-28"
      />
      <p className="w-24 pt-2 text-right text-sm font-medium sm:w-28 text-zinc-900 dark:text-zinc-100">
        {subtotal === null ? "—" : formatoMoneda.format(subtotal)}
      </p>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${producto.nombre} del pedido`}
        className="mt-1.5 rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
