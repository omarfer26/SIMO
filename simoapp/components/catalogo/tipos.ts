// SCRUM-31 (Camilo) — Tipos para el catálogo: forma de un Producto y los
// valores que puede tomar cada filtro de la barra de búsqueda.

export type Categoria =
  | "Electrónica"
  | "Ropa"
  | "Ferretería"
  | "Papelería"
  | "Hogar";

// Las 5 categorías válidas, como lista (no solo como tipo), para poder
// recorrerlas y armar un <select> — la usa el formulario de creación de
// productos (app/formuProductos/page.tsx) en vez de dejar la categoría
// como texto libre.
export const CATEGORIAS: Categoria[] = [
  "Electrónica",
  "Ropa",
  "Ferretería",
  "Papelería",
  "Hogar",
];

export type EstadoProducto = "Activo" | "Inactivo";

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: Categoria;
  unidadMedida: string;
  // precioCompra faltaba en la versión original de SCRUM-31 (la búsqueda
  // no lo necesitaba). Se agregó al integrar el formulario de creación de
  // productos, que sí lo pide, y porque ya está en el modelo oficial de
  // Producto en CLAUDE.md.
  precioCompra: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  estado: EstadoProducto;
}

export type FiltroDisponibilidad = "todos" | "disponible" | "agotado";
export type FiltroEstado = "todos" | EstadoProducto;
export type FiltroCategoria = "todas" | Categoria;
