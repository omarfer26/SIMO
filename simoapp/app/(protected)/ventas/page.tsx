"use client";

import { useState, useEffect } from "react";
import { useProductos } from "@/components/catalogo/ProductosContext";
import type { Producto } from "@/components/catalogo/tipos";
import InputText from "@/components/ui/InputText";
import Button from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import ConfirmarVenta from "@/components/ventas/ConfirmarVenta";
import SeleccionarCliente from "@/components/ventas/SeleccionarCliente";
import SelectorCajeroTurno from "@/components/ventas/SelectorCajeroTurno";
import type { Cliente } from "@/lib/clientes/tipos";
import { formatoDocumento } from "@/lib/clientes/validaciones";
import type { ItemCanasta } from "@/lib/ventas/tipos";
import { leerIdUsuario } from "@/lib/auth/sesion";
import { listarUsuarios } from "@/lib/auth/authService";
import type { UsuarioListado } from "@/lib/auth/tipos";
import {
  guardarCanasta,
  leerCanastaGuardada,
  reconstruirCanasta,
  type CanastaRecuperada,
} from "@/lib/ventas/canastaGuardada";

// SCRUM-50 (Camilo) — Formato de pesos para el aviso de venta registrada.
const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

// SCRUM-121 (Camilo) — Hora en que se guardó la canasta recuperada.
const formatoHora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

function cuandoSeGuardo(fecha: Date) {
  const hora = formatoHora.format(fecha);
  return fecha.toDateString() === new Date().toDateString() ? `a las ${hora}` : `ayer a las ${hora}`;
}

export default function VentasPage() {
  const { productos, origen, descontarStock } = useProductos();
  const [busqueda, setBusqueda] = useState("");
  const [canasta, setCanasta] = useState<ItemCanasta[]>([]);

  // SCRUM-121 (Camilo) — Persistencia de la canasta en el navegador.
  // 1. Recuperar: apenas el catálogo termina de cargar (antes no se puede
  //    saber qué productos siguen existiendo ni su stock), se lee la canasta
  //    guardada y se cruza con el catálogo actual. Se hace una sola vez.
  //    Va aquí, durante el render y no en un useEffect, igual que el patrón
  //    "guardar el valor anterior" de Modal.tsx: así la canasta aparece en el
  //    mismo instante en que aparecen los productos, sin un parpadeo vacío.
  const [recuperacion, setRecuperacion] = useState<"pendiente" | "lista">("pendiente");
  const [recuperada, setRecuperada] = useState<CanastaRecuperada | null>(null);
  if (recuperacion === "pendiente" && origen !== "cargando") {
    setRecuperacion("lista");
    const guardada = leerCanastaGuardada(leerIdUsuario());
    if (guardada) {
      const resultado = reconstruirCanasta(guardada, productos);
      setCanasta(resultado.items);
      setRecuperada(resultado);
    }
  }

  // 2. Guardar: cada vez que cambia la canasta (agregar, +, −, quitar,
  //    confirmar la venta). Si queda vacía, se borra lo guardado. No se
  //    guarda nada antes de recuperar, para no pisar la canasta guardada
  //    con la lista vacía del primer instante.
  useEffect(() => {
    if (recuperacion === "lista") guardarCanasta(canasta, leerIdUsuario());
  }, [canasta, recuperacion]);
  // SCRUM-50 (Camilo) — El aviso ahora tiene tipo: rojo para errores (como
  // antes) y verde para "venta registrada". Y el modal de confirmación.
  const [alerta, setAlerta] = useState<{ mensaje: string; tipo: "error" | "exito" } | null>(null);
  const [ultimoEscaneado, setUltimoEscaneado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // SCRUM-123 (Camilo) — Cliente de la venta. null = Consumidor final.
  // `aperturasCliente` cambia el key del modal cada vez que se abre, para
  // que arranque limpio en el buscador.
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [eligiendoCliente, setEligiendoCliente] = useState(false);
  const [aperturasCliente, setAperturasCliente] = useState(0);

  // Cajero / Vendedor en turno POS
  const [cajeroActual, setCajeroActual] = useState<UsuarioListado | null>(null);
  const [cajerosDisponibles, setCajerosDisponibles] = useState<UsuarioListado[]>([]);
  const [cargandoCajeros, setCargandoCajeros] = useState(true);

  // Cargar usuarios para asociar la transacción al cajero en turno
  useEffect(() => {
    let activo = true;
    async function cargarCajeros() {
      try {
        const lista = await listarUsuarios();
        if (!activo) return;
        // Solo usuarios activos (VENDEDOR, ADMIN o GERENTE que pueden operar caja)
        const activos = lista.filter((u) => u.activo);
        setCajerosDisponibles(activos);

        // Preseleccionar al usuario que tiene la sesión iniciada
        const idSesion = leerIdUsuario();
        const enSesion = activos.find((u) => u.id === idSesion);
        setCajeroActual(enSesion || activos[0] || null);
      } catch (err) {
        console.error("Error al cargar cajeros en turno:", err);
      } finally {
        if (activo) setCargandoCajeros(false);
      }
    }
    cargarCajeros();
    return () => {
      activo = false;
    };
  }, []);

  const abrirBuscarCliente = () => {
    setAperturasCliente((n) => n + 1);
    setEligiendoCliente(true);
  };

  const mostrarAlerta = (mensaje: string, tipo: "error" | "exito" = "error") => {
    setAlerta({ mensaje, tipo });
    setTimeout(() => setAlerta(null), tipo === "exito" ? 6000 : 3000);
  };

  // 1. Buscador Predictivo (Filtra por nombre o SKU)
  const productosFiltrados = productos.filter((p) => {
    const termino = busqueda.toLowerCase();
    return (
      p.estado === "Activo" &&
      (p.nombre.toLowerCase().includes(termino) ||
        p.codigo.toLowerCase().includes(termino))
    );
  });

  const getStockDisponible = (producto: Producto) => {
    const enCanasta = canasta.find((item) => item.producto.id === producto.id)?.cantidad || 0;
    return producto.stockActual - enCanasta;
  };

  // 2. Funciones de Canasta
  const agregarProducto = (producto: Producto) => {
    const stockDisponible = getStockDisponible(producto);

    if (stockDisponible <= 0) {
      mostrarAlerta(`¡Agotado! No hay más unidades disponibles de ${producto.nombre}`);
      return;
    }

    setCanasta((prev) => {
      const existe = prev.find((item) => item.producto.id === producto.id);

      if (existe) {
        return prev.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [...prev, { producto, cantidad: 1 }];
    });
  };

  // Función para procesar y agregar directamente un código de barras / SKU escaneado
  const procesarCodigoEscaneado = (skuOcodigo: string) => {
    const codigoLimpio = skuOcodigo.trim().toLowerCase();
    if (!codigoLimpio) return;

    const productoEncontrado = productos.find(
      (p) => p.estado === "Activo" && p.codigo.trim().toLowerCase() === codigoLimpio
    );

    if (productoEncontrado) {
      agregarProducto(productoEncontrado);
      setUltimoEscaneado(productoEncontrado.nombre);
      setTimeout(() => setUltimoEscaneado(null), 2500);
      setBusqueda("");
    } else {
      mostrarAlerta(`Código no encontrado: "${skuOcodigo.trim()}"`);
    }
  };

  // 3. Listener para Lector de Código de Barras USB (Captura ultra rápida estilo teclado HID)
  useEffect(() => {
    let buffer = "";
    let ultimoTiempo = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar teclas especiales que no corresponden a caracteres imprimibles ni Enter
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
        return;
      }

      const ahora = Date.now();
      const delta = ahora - ultimoTiempo;
      ultimoTiempo = ahora;

      // Si el tiempo entre teclas supera 65ms, se asume entrada manual y se reinicia el búfer del escáner
      if (delta > 65) {
        buffer = "";
      }

      if (e.key === "Enter") {
        // Los lectores USB envían "Enter" tras volcar el código a alta velocidad
        if (buffer.length >= 2) {
          e.preventDefault();
          procesarCodigoEscaneado(buffer);
          buffer = "";
        }
        return;
      }

      // Si es un solo carácter imprimible
      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [productos, canasta]);

  const modificarCantidad = (id: number, delta: number) => {
    setCanasta((prev) => {
      return prev.map((item) => {
        if (item.producto.id === id) {
          const nuevaCantidad = item.cantidad + delta;
          if (nuevaCantidad > item.producto.stockActual) {
            mostrarAlerta(`Stock insuficiente. Solo quedan ${item.producto.stockActual} en total.`);
            return item;
          }
          if (nuevaCantidad < 1) return item; // Para eliminar, se usa otra función
          return { ...item, cantidad: nuevaCantidad };
        }
        return item;
      });
    });
  };

  const eliminarDeCanasta = (id: number) => {
    setCanasta((prev) => prev.filter((item) => item.producto.id !== id));
  };

  // 3. Cálculos Totales
  const total = canasta.reduce(
    (sum, item) => sum + item.producto.precioVenta * item.cantidad,
    0
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 relative">
      {/* Toast Notification Error/Agotado */}
      {alerta && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
          <div
            role="status"
            className={`text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 border ${alerta.tipo === "exito" ? "bg-emerald-600 border-emerald-700" : "bg-red-600 border-red-700"
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              {alerta.tipo === "exito" ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              )}
            </svg>
            <span className="font-medium text-sm">{alerta.mensaje}</span>
          </div>
        </div>
      )}

      {/* Feedback de Escaneo Exitoso */}
      {ultimoEscaneado && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 border border-emerald-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-sm">Escaneado y agregado: <strong>{ultimoEscaneado}</strong></span>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Punto de Venta (POS)
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Busca productos o escanea con el lector de código de barras USB.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 self-start sm:self-auto">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Lector de Códigos USB Activo
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Lado Izquierdo: Buscador y Catálogo */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <InputText
            name="busqueda"
            placeholder="🔍 Buscar por nombre, código o escanear código de barras..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && busqueda.trim().length > 0) {
                e.preventDefault();
                procesarCodigoEscaneado(busqueda.trim());
              }
            }}
            autoComplete="off"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2 max-h-[65vh]">
            {productosFiltrados.length === 0 ? (
              <p className="text-sm text-zinc-500 col-span-2 py-4">No se encontraron productos.</p>
            ) : (
              productosFiltrados.map((prod) => {
                const stockDisponible = getStockDisponible(prod);
                const sinStock = stockDisponible <= 0;

                return (
                  <div
                    key={prod.id}
                    className={`flex flex-col justify-between rounded-lg border p-4 shadow-sm transition-colors
                      ${!sinStock
                        ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                        : "border-red-300 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30"
                      }
                    `}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          {prod.codigo}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${!sinStock
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            }`}
                        >
                          Stock Disp: {stockDisponible}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
                        {prod.nombre}
                      </h3>
                      <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        ${prod.precioVenta.toLocaleString()}
                      </p>
                    </div>

                    <Button
                      className={`mt-4 w-full transition-all ${sinStock ? "opacity-75 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white cursor-not-allowed" : ""}`}
                      disabled={sinStock}
                      onClick={() => agregarProducto(prod)}
                    >
                      {!sinStock ? "Agregar a Canasta" : "Sin stock disponible"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Lado Derecho: Canasta de Compras */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col h-full max-h-[75vh] dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4 space-y-3">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Canasta de Compras
              </h2>

              {/* Selector de Cajero / Vendedor en turno */}
              <SelectorCajeroTurno
                cajeroActual={cajeroActual}
                cajerosDisponibles={cajerosDisponibles}
                cargando={cargandoCajeros}
                onCambiarCajero={(cajero) => {
                  setCajeroActual(cajero);
                  mostrarAlerta(`Cajero en turno: ${cajero.nombreCompleto}`, "exito");
                }}
              />
            </div>

            {/* SCRUM-121 (Camilo) — Aviso de canasta recuperada, con lo que
                se quitó o se ajustó porque el catálogo cambió mientras tanto. */}
            {recuperada && (
              <div
                role="status"
                className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
              >
                <div className="flex-1 space-y-1">
                  <p>
                    Recuperamos la canasta que quedó sin terminar (guardada{" "}
                    {cuandoSeGuardo(recuperada.guardadaEn)}).
                  </p>
                  {recuperada.quitados.length > 0 && (
                    <p className="text-xs">
                      Se quitaron porque ya no están disponibles:{" "}
                      <strong>{recuperada.quitados.join(", ")}</strong>.
                    </p>
                  )}
                  {recuperada.ajustados.length > 0 && (
                    <p className="text-xs">
                      Se bajó la cantidad al stock que queda:{" "}
                      <strong>{recuperada.ajustados.join(", ")}</strong>.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setRecuperada(null)}
                  className="text-sky-500 hover:text-sky-700 dark:hover:text-sky-300"
                  aria-label="Cerrar aviso"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {canasta.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                  <p className="text-sm">La canasta está vacía</p>
                  <p className="text-xs mt-1">Busca un producto y presiona Agregar</p>
                </div>
              ) : (
                canasta.map((item) => {
                  const limiteAlcanzado = item.cantidad >= item.producto.stockActual;

                  return (
                    <div key={item.producto.id} className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                          {item.producto.nombre}
                        </h4>
                        <button
                          onClick={() => eliminarDeCanasta(item.producto.id)}
                          className="text-zinc-400 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md">
                          <button
                            className="px-2 py-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            onClick={() => modificarCantidad(item.producto.id, -1)}
                          >
                            -
                          </button>
                          <span className="text-sm font-medium w-8 text-center text-zinc-900 dark:text-zinc-100">
                            {item.cantidad}
                          </span>
                          <button
                            className={`px-2 py-1 transition-colors ${limiteAlcanzado ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                            disabled={limiteAlcanzado}
                            onClick={() => modificarCantidad(item.producto.id, 1)}
                            title={limiteAlcanzado ? "Stock máximo alcanzado" : "Aumentar cantidad"}
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            ${item.producto.precioVenta.toLocaleString()} c/u
                          </p>
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            ${(item.producto.precioVenta * item.cantidad).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* SCRUM-123 (Camilo) — Cliente de la venta: Consumidor final o
                el elegido en el modal, con sus datos para la factura. */}
            <section className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Cliente
                  </p>
                  {cliente ? (
                    <>
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {cliente.nombre}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {cliente.tipoDocumento} {formatoDocumento(cliente.documento)}
                        {cliente.telefono && ` · ${cliente.telefono}`}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">Consumidor final</p>
                  )}
                </div>
                {cliente && (
                  <button
                    onClick={() => setCliente(null)}
                    className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
                    title="Quitar cliente (Consumidor final)"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <Button variant="secondary" className="mt-2 w-full" onClick={abrirBuscarCliente}>
                {cliente ? "Cambiar cliente" : "🔍 Buscar por Cédula/NIT"}
              </Button>
            </section>

            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex justify-between items-center mb-6">
                <span className="text-base font-medium text-zinc-600 dark:text-zinc-400">Total a Cobrar</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  ${total.toLocaleString()}
                </span>
              </div>
              <Button
                className="w-full h-12 text-base shadow-sm"
                disabled={canasta.length === 0}
                onClick={() => setConfirmando(true)}
              >
                Confirmar Venta
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* SCRUM-50 (Camilo) — Modal de confirmación de venta: método de pago,
          descuento, total y cambio. No se cierra al hacer clic afuera, para
          no perder lo que se escribió por un clic accidental. */}
      <Modal
        isOpen={confirmando}
        onClose={() => setConfirmando(false)}
        title="Confirmar venta"
        maxWidth="lg"
        closeOnBackdropClick={false}
      >
        <ConfirmarVenta
          items={canasta}
          cliente={cliente}
          cajero={cajeroActual}
          onCancelar={() => setConfirmando(false)}
          onConfirmada={(venta, cambio) => {
            descontarStock(
              canasta.map((item) => ({ id: item.producto.id, cantidad: item.cantidad })),
            );
            setConfirmando(false);
            setCanasta([]);
            setCliente(null);
            setRecuperada(null);
            setBusqueda("");
            mostrarAlerta(
              `Venta #${venta.idVenta} registrada por ${formatoMoneda.format(venta.total)}.` +
              (cambio > 0 ? ` Cambio: ${formatoMoneda.format(cambio)}.` : ""),
              "exito",
            );
          }}
        />
      </Modal>

      {/* SCRUM-123 (Camilo) — Modal de búsqueda rápida por Cédula/NIT. */}
      <SeleccionarCliente
        key={aperturasCliente}
        abierto={eligiendoCliente}
        onCerrar={() => setEligiendoCliente(false)}
        onSeleccionar={(elegido) => {
          setCliente(elegido);
          setEligiendoCliente(false);
        }}
      />
    </main>
  );
}
