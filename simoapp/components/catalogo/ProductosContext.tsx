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

      // (Camilo) — IDs de la tabla `unidades_medida` del esquema de Ramón
      // (003_catalogo.sql). El formulario tiene la unidad como texto libre,
      // así que se aceptan nombre y abreviatura; si no coincide, "Unidad".
      const unitMap: Record<string, number> = {
        "unidad": 1, "und": 1,
        "kilogramo": 2, "kg": 2,
        "gramo": 3, "g": 3,
        "litro": 4, "litros": 4, "l": 4
      };

      // (Camilo) — Nombres de campos alineados con el POST /api/products de
      // la rama back-end (sku, id_unidad, stock mínimo por bodega/almacén).
      // El formulario tiene un solo stock mínimo: se envía como el de bodega
      // y el de almacén queda en 0 (valor por defecto del backend).
      const payload = {
        id_categoria: categoryMap[datos.categoria] || 1,
        id_unidad: unitMap[datos.unidadMedida.trim().toLowerCase()] || 1,
        sku: datos.codigo,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        precio_compra: datos.precioCompra,
        precio_venta: datos.precioVenta,
        stock_minimo_bodega: datos.stockMinimo
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
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
          codigo: producto.sku,
          // stock_total es NUMERIC en PostgreSQL y llega como texto ("0.000")
          stockActual: Number(producto.stock_total),
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
