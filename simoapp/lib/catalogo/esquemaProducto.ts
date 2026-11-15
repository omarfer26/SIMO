// SCRUM-155 (Camilo) — Reglas del formulario "Crear Nuevo Producto"
// (/formuProductos), escritas con Zod. Las revisa React Hook Form en el
// navegador ANTES de llamar a la API: si algo no cumple, el producto no se
// envía y el error sale debajo del campo, en español.
//
// Las reglas copian lo que ya exige el backend, para avisar antes en vez de
// esperar el rechazo:
//  - backend/db/migrations/003_catalogo.sql: sku VARCHAR(50) único y no vacío,
//    nombre VARCHAR(150), precios NUMERIC(12,2) >= 0, stock mínimo
//    NUMERIC(12,3) >= 0.
//  - backend/src/routes/productos.routes.js: el precio de venta debe ser
//    MAYOR que el de compra (REGLA_PRECIO).
// El backend sigue validando todo: esto solo evita el viaje en vano.

import { z } from "zod";
import { CATEGORIAS, type Categoria } from "@/components/catalogo/tipos";

// NUMERIC(12,2): hasta 10 dígitos enteros y 2 decimales.
const PRECIO_MAXIMO = 9_999_999_999.99;
// NUMERIC(12,3): hasta 9 dígitos enteros y 3 decimales.
const STOCK_MAXIMO = 999_999_999.999;

// ¿El número tiene como mucho `cantidad` decimales? Se compara con un margen
// pequeño porque en JavaScript 0.1 + 0.2 no da exactamente 0.3.
function maximoDecimales(cantidad: number) {
  const factor = 10 ** cantidad;
  return (valor: number) => Math.abs(valor * factor - Math.round(valor * factor)) < 1e-6;
}

// Un input type="number" vacío llega como NaN (por `valueAsNumber`); Zod lo
// rechaza como "no es un número" y ahí se usa el mensaje de "Escribe...".
function precio(nombreCampo: string) {
  return z
    .number({ error: `Escribe el ${nombreCampo}.` })
    .min(0, { error: `El ${nombreCampo} no puede ser negativo.` })
    .max(PRECIO_MAXIMO, { error: `El ${nombreCampo} es demasiado alto.` })
    .refine(maximoDecimales(2), { error: "Usa como máximo 2 decimales." });
}

export const esquemaProducto = z
  .object({
    // .trim() quita los espacios del principio y del final (por ejemplo, al
    // pegar el código). Si queda vacío o tiene espacios en medio, se rechaza.
    codigo: z
      .string()
      .trim()
      .min(1, { error: "Escribe el código SKU." })
      .max(50, { error: "El SKU puede tener como máximo 50 caracteres." })
      .regex(/^\S+$/, { error: "El SKU no puede tener espacios. Usa guiones, por ejemplo PROD-1002." }),
    nombre: z
      .string()
      .trim()
      .min(1, { error: "Escribe el nombre del producto." })
      .max(150, { error: "El nombre puede tener como máximo 150 caracteres." }),
    descripcion: z.string().trim(),
    // El select arranca en "" ("Seleccione una categoría"), que no está en la lista.
    categoria: z.enum(CATEGORIAS as [Categoria, ...Categoria[]], {
      error: "Elige una categoría.",
    }),
    unidadMedida: z
      .string()
      .trim()
      .min(1, { error: "Escribe la unidad de medida." })
      .max(30, { error: "La unidad puede tener como máximo 30 caracteres." }),
    precioCompra: precio("precio de compra"),
    precioVenta: precio("precio de venta").refine((valor) => valor > 0, {
      error: "El precio de venta debe ser mayor que 0.",
    }),
    stockMinimo: z
      .number({ error: "Escribe el stock mínimo (puede ser 0)." })
      .min(0, { error: "El stock mínimo no puede ser negativo." })
      .max(STOCK_MAXIMO, { error: "El stock mínimo es demasiado alto." })
      .refine(maximoDecimales(3), { error: "Usa como máximo 3 decimales." }),
  })
  // Regla de negocio del backend: vender por debajo o igual al costo no se
  // permite. El error se pega al campo "Precio de Venta". `when` hace que
  // esta revisión corra aunque otros campos (el nombre, el SKU...) todavía
  // tengan errores, siempre que los dos precios sean números válidos.
  .refine((datos) => datos.precioVenta > datos.precioCompra, {
    error: "El precio de venta debe ser mayor que el precio de compra.",
    path: ["precioVenta"],
    when: (payload) =>
      !payload.issues.some(
        (issue) => issue.path?.[0] === "precioCompra" || issue.path?.[0] === "precioVenta",
      ),
  });

/** Lo que escribe el usuario (antes de limpiar espacios). */
export type ProductoFormulario = z.input<typeof esquemaProducto>;
/** Lo que se envía a la API (ya validado y sin espacios de sobra). */
export type ProductoValidado = z.output<typeof esquemaProducto>;
