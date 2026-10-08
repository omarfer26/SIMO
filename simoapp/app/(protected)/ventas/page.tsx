"use client";

import { useState } from "react";
import { useProductos } from "@/components/catalogo/ProductosContext";
import type { Producto } from "@/components/catalogo/tipos";
import InputText from "@/components/ui/InputText";
import Button from "@/components/ui/Button";

interface ItemCanasta {
  producto: Producto;
  cantidad: number;
}

export default function VentasPage() {
  const { productos } = useProductos();
  const [busqueda, setBusqueda] = useState("");
  const [canasta, setCanasta] = useState<ItemCanasta[]>([]);

  // 1. Buscador Predictivo (Filtra por nombre o SKU)
  const productosFiltrados = productos.filter((p) => {
    const termino = busqueda.toLowerCase();
    return (
      p.estado === "Activo" &&
      (p.nombre.toLowerCase().includes(termino) ||
        p.codigo.toLowerCase().includes(termino))
    );
  });

  // 2. Funciones de Canasta
  const agregarProducto = (producto: Producto) => {
    setCanasta((prev) => {
      const existe = prev.find((item) => item.producto.id === producto.id);
      
      if (existe) {
        // Validación de Stock
        if (existe.cantidad + 1 > producto.stockActual) {
          alert(`¡Stock insuficiente! Solo hay ${producto.stockActual} unidades de ${producto.nombre}`);
          return prev;
        }
        return prev.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      if (producto.stockActual < 1) {
        alert("Este producto está agotado.");
        return prev;
      }
      
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const modificarCantidad = (id: number, delta: number) => {
    setCanasta((prev) => {
      return prev.map((item) => {
        if (item.producto.id === id) {
          const nuevaCantidad = item.cantidad + delta;
          if (nuevaCantidad > item.producto.stockActual) {
            alert(`Stock insuficiente. Solo quedan ${item.producto.stockActual}`);
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
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Punto de Venta (POS)
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Busca productos y agrégalos a la canasta.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Lado Izquierdo: Buscador y Catálogo */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <InputText
            name="busqueda"
            placeholder="🔍 Buscar por nombre, código o lector de barras..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoComplete="off"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2 max-h-[65vh]">
            {productosFiltrados.length === 0 ? (
              <p className="text-sm text-zinc-500 col-span-2 py-4">No se encontraron productos.</p>
            ) : (
              productosFiltrados.map((prod) => (
                <div
                  key={prod.id}
                  className={`flex flex-col justify-between rounded-lg border p-4 shadow-sm transition-colors
                    ${
                      prod.stockActual > 0
                        ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                        : "border-red-200 bg-red-50 opacity-80 dark:border-red-900 dark:bg-red-950/30"
                    }
                  `}
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                        {prod.codigo}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          prod.stockActual > 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                        }`}
                      >
                        Stock: {prod.stockActual}
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
                    className="mt-4 w-full"
                    disabled={prod.stockActual === 0}
                    onClick={() => agregarProducto(prod)}
                  >
                    {prod.stockActual > 0 ? "Agregar a Canasta" : "Agotado"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado Derecho: Canasta de Compras */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col h-full max-h-[75vh] dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
              Canasta de Compras
            </h2>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {canasta.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                  <p className="text-sm">La canasta está vacía</p>
                  <p className="text-xs mt-1">Busca un producto y presiona Agregar</p>
                </div>
              ) : (
                canasta.map((item) => (
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
                          className="px-2 py-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          onClick={() => modificarCantidad(item.producto.id, 1)}
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
                ))
              )}
            </div>

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
                onClick={() => {
                  alert("Venta confirmada simulada exitosamente. Aquí iría la conexión al backend.");
                  setCanasta([]);
                  setBusqueda("");
                }}
              >
                Confirmar Venta
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
