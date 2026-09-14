// SCRUM-31 (Camilo) — Tipos para el catálogo: forma de un Producto y los
// valores que puede tomar cada filtro de la barra de búsqueda.

export type Categoria =
  | "Electrónica"
  | "Ropa"
  | "Ferretería"
  | "Papelería"
  | "Hogar";

export type EstadoProducto = "Activo" | "Inactivo";

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: Categoria;
  unidadMedida: string;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  estado: EstadoProducto;
}

export type FiltroDisponibilidad = "todos" | "disponible" | "agotado";
export type FiltroEstado = "todos" | EstadoProducto;
export type FiltroCategoria = "todas" | Categoria;
