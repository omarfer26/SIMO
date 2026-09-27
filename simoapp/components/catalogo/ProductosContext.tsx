"use client";

// SCRUM-31 (Camilo) — Estado compartido de productos entre /catalogo y
// /formuProductos. Antes cada página tenía su propia lista por separado:
// el formulario de crear producto armaba el objeto y solo lo mandaba a la
// consola del navegador (console.log), así que nunca aparecía en el
// catálogo — eso es lo que se arregló acá. Ahora las dos páginas leen y
// escriben la MISMA lista, guardada con Context + useState, empezando
// desde `productosMock`. Se provee una sola vez en app/layout.tsx (junto
// al Shell), para que sobreviva mientras se navega entre páginas.
// Mientras no exista backend, esto vive solo en memoria del navegador: se
// pierde al recargar.

import { createContext, useContext, useState, type ReactNode } from "react";
import { productosMock } from "./productos.mock";
import type { Producto } from "./tipos";

type ProductoNuevo = Omit<Producto, "id" | "stockActual" | "estado">;

interface ProductosContextValue {
  productos: Producto[];
  agregarProducto: (datos: ProductoNuevo) => void;
}

const ProductosContext = createContext<ProductosContextValue | null>(null);

export function ProductosProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<Producto[]>(productosMock);

  function agregarProducto(datos: ProductoNuevo) {
    setProductos((actuales) => [
      ...actuales,
      {
        ...datos,
        id: Math.max(0, ...actuales.map((p) => p.id)) + 1,
        // Un producto recién creado todavía no tiene movimientos en el
        // Kardex, así que arranca sin stock y activo por defecto.
        stockActual: 0,
        estado: "Activo",
      },
    ]);
  }

  return (
    <ProductosContext.Provider value={{ productos, agregarProducto }}>
      {children}
    </ProductosContext.Provider>
  );
}

export function useProductos() {
  const contexto = useContext(ProductosContext);
  if (!contexto) {
    throw new Error("useProductos debe usarse dentro de <ProductosProvider>");
  }
  return contexto;
}
