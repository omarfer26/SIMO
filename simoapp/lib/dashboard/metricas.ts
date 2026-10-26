// Dashboard Operacional — Cuentas del tablero: rango de fechas del período,
// serie de ventas por día/semana, resumen con comparación contra el período
// anterior, rotación de stock por producto y uso de los medios de pago.
//
// Todo son funciones puras sobre el historial de ventas (VentaHistorial, el
// mismo que muestra /ventas) y sobre el catálogo (Producto, con el stock que
// ya trae el backend): así el tablero se puede probar sin montar la pantalla
// y no guarda estado propio.

import type { Producto } from "@/components/catalogo/tipos";
import {
  METODOS_PAGO,
  type CodigoMetodoPago,
  type VentaHistorial,
} from "@/lib/ventas/tipos";
import { etiquetaSemana, formatoFechaCorta } from "./formato";
import type {
  ClasificacionRotacion,
  DatosDashboard,
  Granularidad,
  OpcionPeriodo,
  PeriodoDashboard,
  PuntoSerieVentas,
  RangoFechas,
  ResumenVentas,
  RotacionProducto,
  UsoMetodoPago,
} from "./tipos";

export const PERIODOS_DASHBOARD: OpcionPeriodo[] = [
  { id: "7d", etiqueta: "7 días", descripcion: "Últimos 7 días" },
  { id: "30d", etiqueta: "30 días", descripcion: "Últimos 30 días" },
  { id: "90d", etiqueta: "90 días", descripcion: "Últimos 90 días" },
  { id: "mes", etiqueta: "Este mes", descripcion: "Del 1.º del mes a hoy" },
];

// Cuántos productos entran al gráfico de rotación (el resto queda en la tabla).
export const TOP_ROTACION = 7;

// Umbrales del índice de rotación (unidades vendidas / inventario promedio).
// Con el catálogo actual, "alta" es un producto que en el período vendió más
// de las tres cuartas partes de su inventario promedio.
export const UMBRAL_ROTACION_ALTA = 0.75;
export const UMBRAL_ROTACION_MEDIA = 0.3;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------

function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function finDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(23, 59, 59, 999);
  return copia;
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

// Lunes de la semana de `fecha` (en Colombia la semana empieza el lunes).
function inicioDeSemana(fecha: Date): Date {
  const dia = inicioDelDia(fecha);
  const desplazamiento = (dia.getDay() + 6) % 7;
  return sumarDias(dia, -desplazamiento);
}

// "2026-10-26" con la fecha local (toISOString usaría UTC y correría el día).
function claveFecha(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function obtenerRango(
  periodo: PeriodoDashboard,
  ahora: Date = new Date(),
): RangoFechas {
  const hoy = inicioDelDia(ahora);

  if (periodo === "mes") {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return {
      desde,
      hasta: hoy,
      dias: Math.round((hoy.getTime() - desde.getTime()) / MS_POR_DIA) + 1,
    };
  }

  const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
  return { desde: sumarDias(hoy, -(dias - 1)), hasta: hoy, dias };
}

// Período inmediatamente anterior y de la misma duración, para la variación
// de las tarjetas ("+12 % frente a los 30 días previos").
function obtenerRangoAnterior(rango: RangoFechas): RangoFechas {
  const hasta = sumarDias(rango.desde, -1);
  return { desde: sumarDias(hasta, -(rango.dias - 1)), hasta, dias: rango.dias };
}

function ventasDelRango(ventas: VentaHistorial[], rango: RangoFechas): VentaHistorial[] {
  const desde = rango.desde.getTime();
  const hasta = finDelDia(rango.hasta).getTime();
  return ventas.filter((venta) => {
    const instante = new Date(venta.fecha).getTime();
    return instante >= desde && instante <= hasta;
  });
}

function completadas(ventas: VentaHistorial[]): VentaHistorial[] {
  return ventas.filter((venta) => venta.estado === "COMPLETADA");
}

function unidadesDeVenta(venta: VentaHistorial): number {
  return venta.items.reduce((suma, item) => suma + item.cantidad, 0);
}

export function granularidadDe(periodo: PeriodoDashboard): Granularidad {
  return periodo === "90d" ? "semana" : "dia";
}

// ---------------------------------------------------------------------
// Series y resumen de ventas
// ---------------------------------------------------------------------

export function construirSerieVentas(
  ventas: VentaHistorial[],
  rango: RangoFechas,
  granularidad: Granularidad,
): PuntoSerieVentas[] {
  const puntos: PuntoSerieVentas[] = [];
  const indice = new Map<string, PuntoSerieVentas>();

  // Se crean TODOS los tramos del rango (aunque no tengan ventas) para que
  // el eje no se salte días y la línea de tiempo se lea continua.
  const paso = granularidad === "semana" ? 7 : 1;
  const primerTramo = granularidad === "semana" ? inicioDeSemana(rango.desde) : rango.desde;

  for (
    let cursor = primerTramo;
    cursor.getTime() <= rango.hasta.getTime();
    cursor = sumarDias(cursor, paso)
  ) {
    const punto: PuntoSerieVentas = {
      clave: claveFecha(cursor),
      etiqueta: granularidad === "semana" ? etiquetaSemana(cursor) : formatoFechaCorta.format(cursor),
      ingresos: 0,
      ventas: 0,
      unidades: 0,
    };
    puntos.push(punto);
    indice.set(punto.clave, punto);
  }

  for (const venta of completadas(ventasDelRango(ventas, rango))) {
    const fechaVenta = new Date(venta.fecha);
    const tramo = granularidad === "semana" ? inicioDeSemana(fechaVenta) : inicioDelDia(fechaVenta);
    const punto = indice.get(claveFecha(tramo));
    if (!punto) continue;

    punto.ingresos += venta.total;
    punto.ventas += 1;
    punto.unidades += unidadesDeVenta(venta);
  }

  return puntos;
}

function variacion(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

export function calcularResumenVentas(
  ventas: VentaHistorial[],
  rango: RangoFechas,
): ResumenVentas {
  const delPeriodo = ventasDelRango(ventas, rango);
  const delAnterior = ventasDelRango(ventas, obtenerRangoAnterior(rango));

  const hechas = completadas(delPeriodo);
  const anuladas = delPeriodo.filter((venta) => venta.estado === "ANULADA");
  const hechasAntes = completadas(delAnterior);

  const ingresos = hechas.reduce((suma, venta) => suma + venta.total, 0);
  const ingresosAntes = hechasAntes.reduce((suma, venta) => suma + venta.total, 0);
  const unidades = hechas.reduce((suma, venta) => suma + unidadesDeVenta(venta), 0);
  const unidadesAntes = hechasAntes.reduce((suma, venta) => suma + unidadesDeVenta(venta), 0);

  return {
    ingresos,
    variacionIngresos: variacion(ingresos, ingresosAntes),
    ventas: hechas.length,
    variacionVentas: variacion(hechas.length, hechasAntes.length),
    ticketPromedio: hechas.length > 0 ? ingresos / hechas.length : 0,
    unidadesVendidas: unidades,
    variacionUnidades: variacion(unidades, unidadesAntes),
    ventasAnuladas: anuladas.length,
    montoAnulado: anuladas.reduce((suma, venta) => suma + venta.total, 0),
  };
}

// ---------------------------------------------------------------------
// Rotación de stock
// ---------------------------------------------------------------------

function clasificarRotacion(
  unidadesVendidas: number,
  indiceRotacion: number,
): ClasificacionRotacion {
  if (unidadesVendidas === 0) return "sin_movimiento";
  if (indiceRotacion >= UMBRAL_ROTACION_ALTA) return "alta";
  if (indiceRotacion >= UMBRAL_ROTACION_MEDIA) return "media";
  return "baja";
}

// Rotación = unidades vendidas en el período / inventario promedio.
//
// El sistema solo guarda el stock de HOY, no el de cada día, así que el
// inventario promedio se estima como `stock actual + la mitad de lo vendido`
// (se supone que el stock bajó de forma pareja durante el período). Es una
// aproximación, no un kardex: si más adelante el backend expone los saldos
// históricos, esta cuenta se reemplaza y el resto del tablero no cambia.
export function calcularRotacionStock(
  productos: Producto[],
  ventas: VentaHistorial[],
  rango: RangoFechas,
): RotacionProducto[] {
  const vendidoPorProducto = new Map<number, { unidades: number; ingresos: number }>();

  for (const venta of completadas(ventasDelRango(ventas, rango))) {
    for (const item of venta.items) {
      const acumulado = vendidoPorProducto.get(item.idProducto) ?? {
        unidades: 0,
        ingresos: 0,
      };
      acumulado.unidades += item.cantidad;
      acumulado.ingresos += item.subtotal;
      vendidoPorProducto.set(item.idProducto, acumulado);
    }
  }

  return productos
    .map((producto) => {
      const vendido = vendidoPorProducto.get(producto.id) ?? { unidades: 0, ingresos: 0 };
      const inventarioPromedio = producto.stockActual + vendido.unidades / 2;
      const indiceRotacion =
        inventarioPromedio > 0 ? vendido.unidades / inventarioPromedio : 0;

      return {
        idProducto: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        categoria: producto.categoria,
        unidadesVendidas: vendido.unidades,
        ingresos: vendido.ingresos,
        stockActual: producto.stockActual,
        stockMinimo: producto.stockMinimo,
        indiceRotacion,
        // Al ritmo de venta del período, ¿para cuántos días alcanza el stock?
        coberturaDias:
          vendido.unidades > 0 ? (producto.stockActual / vendido.unidades) * rango.dias : null,
        clasificacion: clasificarRotacion(vendido.unidades, indiceRotacion),
        requiereReposicion: producto.stockActual <= producto.stockMinimo,
      } satisfies RotacionProducto;
    })
    .sort((a, b) => b.indiceRotacion - a.indiceRotacion || b.ingresos - a.ingresos);
}

// ---------------------------------------------------------------------
// Medios de pago
// ---------------------------------------------------------------------

export function calcularMetodosPago(
  ventas: VentaHistorial[],
  rango: RangoFechas,
): UsoMetodoPago[] {
  const totales = new Map<CodigoMetodoPago, { total: number; ventas: number }>();

  for (const venta of completadas(ventasDelRango(ventas, rango))) {
    const acumulado = totales.get(venta.metodoPago) ?? { total: 0, ventas: 0 };
    acumulado.total += venta.total;
    acumulado.ventas += 1;
    totales.set(venta.metodoPago, acumulado);
  }

  const ingresos = [...totales.values()].reduce((suma, fila) => suma + fila.total, 0);

  return METODOS_PAGO.filter((metodo) => totales.has(metodo.codigo))
    .map((metodo) => {
      const fila = totales.get(metodo.codigo) as { total: number; ventas: number };
      return {
        metodo: metodo.codigo,
        nombre: metodo.nombre,
        total: fila.total,
        ventas: fila.ventas,
        porcentaje: ingresos > 0 ? (fila.total / ingresos) * 100 : 0,
      } satisfies UsoMetodoPago;
    })
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------
// Entrada única que usa la página
// ---------------------------------------------------------------------

export function calcularDashboard(entrada: {
  ventas: VentaHistorial[];
  productos: Producto[];
  periodo: PeriodoDashboard;
  ahora?: Date;
}): DatosDashboard {
  const rango = obtenerRango(entrada.periodo, entrada.ahora);
  const granularidad = granularidadDe(entrada.periodo);

  return {
    rango,
    granularidad,
    resumen: calcularResumenVentas(entrada.ventas, rango),
    serie: construirSerieVentas(entrada.ventas, rango, granularidad),
    rotacion: calcularRotacionStock(entrada.productos, entrada.ventas, rango),
    metodosPago: calcularMetodosPago(entrada.ventas, rango),
  };
}
