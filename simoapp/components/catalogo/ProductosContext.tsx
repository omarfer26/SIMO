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
  agregarProducto: (datos: ProductoNuevo) => Promise<void>;
}

const ProductosContext = createContext<ProductosContextValue | null>(null);

export function ProductosProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<Producto[]>(productosMock);

  async function agregarProducto(datos: ProductoNuevo) {
    try {
      const categoryMap: Record<string, number> = {
        "Electrónica": 1,
        "Ropa": 2,
        "Ferretería": 3,
        "Papelería": 4,
        "Hogar": 5
      };

      const payload = {
        id_categoria: categoryMap[datos.categoria] || 1,
        codigo_barras: datos.codigo,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        precio_compra: datos.precioCompra,
        precio_venta: datos.precioVenta,
        stock_minimo: datos.stockMinimo
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${apiUrl}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Error from backend:", errorData);
        alert(`Error: ${errorData.message}`);
        return;
      }

      const { producto } = await res.json();

      setProductos((actuales) => [
        ...actuales,
        {
          ...datos,
          id: producto.id_producto,
          codigo: producto.codigo_barras,
          stockActual: producto.stock_actual,
          estado: producto.estado ? "Activo" : "Inactivo",
        },
      ]);
    } catch (error) {
      console.error("Error conectando al backend", error);
      alert("Error conectando al backend");
    }
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
