"use client";

// SCRUM-31 (Camilo) — Estado compartido de productos entre /catalogo y
// /formuProductos. Antes cada página tenía su propia lista por separado:
// el formulario de crear producto armaba el objeto y solo lo mandaba a la
// consola del navegador (console.log), así que nunca aparecía en el
// catálogo — eso es lo que se arregló acá. Ahora las dos páginas leen y
// escriben la MISMA lista, guardada con Context + useState, empezando
// desde `productosMock`. Se provee una sola vez en app/layout.tsx (junto
// al Shell), para que sobreviva mientras se navega entre páginas.
//
// SCRUM-catalogoBD (Camilo) — La lista ya no arranca de `productosMock`: al
// abrir la app se le pide al backend (GET /api/products), que la lee de la
// base de datos. Los nombres que llegan son los de la tabla `productos`
// (sku, stock_total, stock_minimo_bodega...) y `aProducto` los convierte a
// los que usa el frontend. Los datos de prueba solo se usan como respaldo
// si el backend no responde, y en ese caso `origen` vale "respaldo" para
// que la pantalla lo avise. Cuando el GET funcione de forma estable, se
// puede borrar productos.mock.ts y ese respaldo.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { productosMock } from "./productos.mock";
import type { Categoria, Producto } from "./tipos";

type ProductoNuevo = Omit<Producto, "id" | "stockActual" | "estado">;

// De dónde salió la lista que se está mostrando.
export type OrigenProductos = "cargando" | "backend" | "respaldo";

interface ProductosContextValue {
  productos: Producto[];
  origen: OrigenProductos;
  agregarProducto: (datos: ProductoNuevo) => Promise<void>;
}

const ProductosContext = createContext<ProductosContextValue | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

// Fila de producto tal como sale de la tabla `productos`
// (backend/db/migrations/003_catalogo.sql). Los NUMERIC de PostgreSQL llegan
// como texto ("89900.00"), por eso se aceptan texto o número. `categoria` y
// `unidad` (los nombres) son opcionales: si el backend no los manda, se
// deducen del id con las tablitas de abajo.
interface ProductoApi {
  id_producto: number;
  id_categoria: number;
  id_unidad?: number;
  sku: string;
  nombre: string;
  descripcion: string | null;
  precio_compra: string | number;
  precio_venta: string | number;
  stock_total: string | number;
  stock_minimo_bodega: string | number;
  estado: boolean;
  categoria?: string;
  unidad?: string;
}

// Mismos id que crean la migración y los datos de prueba del backend en una
// base nueva. Lo ideal es que el backend mande el nombre directamente.
const NOMBRE_CATEGORIA: Record<number, Categoria> = {
  1: "Electrónica",
  2: "Ropa",
  3: "Ferretería",
  4: "Papelería",
  5: "Hogar",
};
const NOMBRE_UNIDAD: Record<number, string> = {
  1: "Unidad",
  2: "Kilogramo",
  3: "Gramo",
  4: "Litro",
};

function aProducto(fila: ProductoApi): Producto {
  return {
    id: fila.id_producto,
    codigo: fila.sku,
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? "",
    categoria:
      (fila.categoria as Categoria | undefined) ??
      NOMBRE_CATEGORIA[fila.id_categoria] ??
      (`Categoría ${fila.id_categoria}` as Categoria),
    unidadMedida:
      fila.unidad ?? NOMBRE_UNIDAD[fila.id_unidad ?? 1] ?? "Unidad",
    precioCompra: Number(fila.precio_compra),
    precioVenta: Number(fila.precio_venta),
    stockActual: Number(fila.stock_total),
    stockMinimo: Number(fila.stock_minimo_bodega),
    estado: fila.estado ? "Activo" : "Inactivo",
  };
}

// El backend entrega los productos por páginas; se piden todas, porque el
// catálogo busca y filtra en el navegador sobre la lista completa.
async function pedirProductos(): Promise<Producto[]> {
  const filas: ProductoApi[] = [];
  for (let pagina = 1; ; pagina++) {
    const res = await fetch(`${API_URL}/products?page=${pagina}&limit=100`);
    if (!res.ok) throw new Error(`GET /products respondió ${res.status}`);
    const cuerpo: { data: ProductoApi[]; meta?: { hasNextPage?: boolean } } =
      await res.json();
    filas.push(...cuerpo.data);
    if (!cuerpo.meta?.hasNextPage) break;
  }
  return filas.map(aProducto);
}

export function ProductosProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [origen, setOrigen] = useState<OrigenProductos>("cargando");

  useEffect(() => {
    let vigente = true;
    pedirProductos()
      .then((lista) => {
        if (!vigente) return;
        setProductos(lista);
        setOrigen("backend");
      })
      .catch((error) => {
        if (!vigente) return;
        console.error("No se pudo cargar el catálogo desde el backend", error);
        setProductos(productosMock);
        setOrigen("respaldo");
      });
    return () => {
      vigente = false;
    };
  }, []);

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

      const res = await fetch(`${API_URL}/products`, {
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
    <ProductosContext.Provider value={{ productos, origen, agregarProducto }}>
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
