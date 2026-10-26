// Dashboard Operacional — Tipos de los indicadores que se muestran en la
// página de inicio ("/"): ventas por período, rotación de stock y medios de
// pago. Las cuentas que los llenan viven en metricas.ts, y el formato de
// moneda/fecha en formato.ts.

import type { CodigoMetodoPago } from "@/lib/ventas/tipos";

// Períodos que ofrece el selector del tablero. "mes" es el mes en curso
// (del día 1 a hoy), no los últimos 30 días.
export type PeriodoDashboard = "7d" | "30d" | "90d" | "mes";

export interface OpcionPeriodo {
  id: PeriodoDashboard;
  etiqueta: string;
  /** Texto largo que se muestra junto al título del gráfico. */
  descripcion: string;
}

// Para 90 días un punto por día no se lee: la serie se agrupa por semana.
export type Granularidad = "dia" | "semana";

export interface RangoFechas {
  /** Medianoche del primer día del rango. */
  desde: Date;
  /** Medianoche de hoy (último día del rango). */
  hasta: Date;
  /** Días calendario que cubre el rango, contando hoy. */
  dias: number;
}

// Un punto (barra) de la serie de ventas: un día o una semana.
export interface PuntoSerieVentas {
  /** Fecha ISO del inicio del tramo; sirve de clave estable para React. */
  clave: string;
  etiqueta: string;
  ingresos: number;
  ventas: number;
  unidades: number;
}

export interface ResumenVentas {
  ingresos: number;
  /** Variación % frente al período anterior de igual duración; null si no hay base. */
  variacionIngresos: number | null;
  ventas: number;
  variacionVentas: number | null;
  ticketPromedio: number;
  unidadesVendidas: number;
  variacionUnidades: number | null;
  ventasAnuladas: number;
  montoAnulado: number;
}

export type ClasificacionRotacion = "alta" | "media" | "baja" | "sin_movimiento";

export interface RotacionProducto {
  idProducto: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidadesVendidas: number;
  ingresos: number;
  stockActual: number;
  stockMinimo: number;
  /** Unidades vendidas / inventario promedio del período (ver metricas.ts). */
  indiceRotacion: number;
  /** Días que alcanza el stock actual al ritmo de venta del período; null si no se vendió. */
  coberturaDias: number | null;
  clasificacion: ClasificacionRotacion;
  requiereReposicion: boolean;
}

export interface UsoMetodoPago {
  metodo: CodigoMetodoPago;
  nombre: string;
  total: number;
  ventas: number;
  /** Participación sobre los ingresos del período (0–100). */
  porcentaje: number;
}

export interface DatosDashboard {
  rango: RangoFechas;
  granularidad: Granularidad;
  resumen: ResumenVentas;
  serie: PuntoSerieVentas[];
  rotacion: RotacionProducto[];
  metodosPago: UsoMetodoPago[];
}
