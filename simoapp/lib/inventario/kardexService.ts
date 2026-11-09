// SCRUM-39 (Camilo) — Puerta única hacia el backend para leer el Kardex de
// un producto. La página /kardex llama a obtenerKardex() sin saber si detrás
// hay una API real o el mock. Mismo molde que trasladosService.ts.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_KARDEX_MOCK=false
// y reiniciar `npm run dev`. Mientras no sea "false" se usa el mock, porque
// ninguna rama del backend tiene todavía un endpoint del Kardex (revisado el
// 2026-10-25: solo existe la función fn_kardex_producto, migración 012).
//
// CONTRATO QUE SE LE PROPONE AL BACKEND (ver camilo-sanchez.md, SCRUM-39):
//   GET /api/inventory/kardex/:id_producto   (roles INVENTARIO, ADMIN, GERENTE)
//   Responde 200: { movimientos: [ ...una fila por movimiento... ] }
//     Cada fila trae las columnas de fn_kardex_producto(id) (id_movimiento,
//     fecha_movimiento, tipo_movimiento, entrada_bodega, salida_bodega,
//     entrada_almacen, salida_almacen, saldo_bodega, saldo_almacen,
//     saldo_total, costo_unitario, costo_promedio, saldo_valorizado,
//     saldo_coincide, documento_referencia, motivo) y además:
//       - nombre_usuario (JOIN con usuarios; la función solo da id_usuario)
//       - id_venta e id_pedido (la función no los devuelve; hay que agregarlos)
//   Errores: 404 producto no existe (SQLSTATE SM001 de la función).
// El historial llega completo y en orden cronológico; el filtro de fechas se
// hace en el navegador. Los saldos no cambian por filtrar: la función los
// calcula siempre desde el primer movimiento.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { Producto } from "@/components/catalogo/tipos";
import type { MovimientoKardex, TipoMovimiento } from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_KARDEX_MOCK !== "false";

type TipoErrorKardex = "no_existe" | "sin_conexion" | "servidor";

export class ErrorKardex extends Error {
  tipo: TipoErrorKardex;

  constructor(tipo: TipoErrorKardex, mensaje: string) {
    super(mensaje);
    this.name = "ErrorKardex";
    this.tipo = tipo;
  }
}

// Fila tal como llega del backend. Los NUMERIC de PostgreSQL llegan como
// texto ("12.000"), por eso se aceptan texto o número.
type Numero = string | number;
interface MovimientoApi {
  id_movimiento: Numero;
  fecha_movimiento: string;
  tipo_movimiento: TipoMovimiento;
  entrada_bodega: Numero;
  salida_bodega: Numero;
  entrada_almacen: Numero;
  salida_almacen: Numero;
  saldo_bodega: Numero;
  saldo_almacen: Numero;
  saldo_total: Numero;
  costo_unitario: Numero;
  costo_promedio: Numero;
  saldo_valorizado: Numero;
  saldo_coincide: boolean;
  nombre_usuario?: string | null;
  id_venta?: number | null;
  id_pedido?: number | null;
  documento_referencia: string | null;
  motivo: string | null;
}

/** `producto` solo lo usa el mock, para inventar un historial que cuadre con su stock. */
export async function obtenerKardex(producto: Producto): Promise<MovimientoKardex[]> {
  if (USAR_MOCK) return obtenerKardexMock(producto);

  try {
    const { data } = await apiClient.get(`/inventory/kardex/${producto.id}`);
    return (data.movimientos as MovimientoApi[]).map((m) => ({
      idMovimiento: Number(m.id_movimiento),
      fecha: new Date(m.fecha_movimiento),
      tipo: m.tipo_movimiento,
      entradaBodega: Number(m.entrada_bodega),
      salidaBodega: Number(m.salida_bodega),
      entradaAlmacen: Number(m.entrada_almacen),
      salidaAlmacen: Number(m.salida_almacen),
      saldoBodega: Number(m.saldo_bodega),
      saldoAlmacen: Number(m.saldo_almacen),
      saldoTotal: Number(m.saldo_total),
      costoUnitario: Number(m.costo_unitario),
      costoPromedio: Number(m.costo_promedio),
      saldoValorizado: Number(m.saldo_valorizado),
      saldoCoincide: m.saldo_coincide,
      nombreUsuario: m.nombre_usuario ?? "",
      idVenta: m.id_venta ?? null,
      idPedido: m.id_pedido ?? null,
      documentoReferencia: m.documento_referencia,
      motivo: m.motivo,
    }));
  } catch (error) {
    if (!isAxiosError(error)) throw new ErrorKardex("servidor", "Error inesperado.");
    if (!error.response) throw new ErrorKardex("sin_conexion", error.message);
    if (error.response.status === 404) throw new ErrorKardex("no_existe", error.message);
    throw new ErrorKardex("servidor", error.message);
  }
}

export function mensajeErrorKardex(error: unknown): string {
  if (!(error instanceof ErrorKardex)) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  switch (error.tipo) {
    case "no_existe":
      return "El producto ya no existe en el inventario.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor para traer el Kardex.";
    case "servidor":
      return "El servidor tuvo un problema al traer el Kardex.";
  }
}

// ---------------------------------------------------------------------
// Mock: inventa 7 movimientos de las últimas semanas (compras, traslado,
// ventas, un ajuste y una anulación) calculados para que el saldo final sea
// justo el stock de Bodega y Almacén que tiene el producto. Los saldos y el
// costo promedio se calculan igual que fn_kardex_producto.
// ---------------------------------------------------------------------
interface PasoMock {
  diasAtras: number;
  hora: number;
  tipo: TipoMovimiento;
  origen?: "BODEGA" | "ALMACEN";
  destino?: "BODEGA" | "ALMACEN";
  cantidad: number;
  /** Solo las entradas desde fuera (compras) traen su propio costo. */
  costo?: number;
  usuario: string;
  idVenta?: number;
  documento?: string;
  motivo?: string;
}

const redondear = (valor: number, decimales: number) =>
  Math.round(valor * 10 ** decimales) / 10 ** decimales;

async function obtenerKardexMock(producto: Producto): Promise<MovimientoKardex[]> {
  await new Promise((resolver) => setTimeout(resolver, 500));

  const bodega = producto.stockBodega;
  const almacen = producto.stockAlmacen;
  const costo = producto.precioCompra;
  const venta = 1040 + producto.id * 7;

  // Las cantidades salen de despejar los saldos finales: Bodega queda en
  // `bodega` y Almacén en `almacen`, y ningún saldo pasa por negativo.
  const pasos: PasoMock[] = [
    { diasAtras: 38, hora: 9, tipo: "ENTRADA_COMPRA", destino: "BODEGA", cantidad: bodega + almacen + 2, costo, usuario: "Diana Rojas", documento: `FC-${2200 + producto.id}` },
    { diasAtras: 30, hora: 10, tipo: "ENTRADA_COMPRA", destino: "BODEGA", cantidad: 6, costo: Math.round(costo * 1.08), usuario: "Diana Rojas", documento: `FC-${2270 + producto.id}` },
    { diasAtras: 29, hora: 8, tipo: "TRASLADO_INTERNO", origen: "BODEGA", destino: "ALMACEN", cantidad: almacen + 7, usuario: "Laura Gómez", motivo: "Surtir la vitrina para la temporada." },
    { diasAtras: 21, hora: 16, tipo: "SALIDA_VENTA", origen: "ALMACEN", cantidad: 5, usuario: "Julián Castro", idVenta: venta },
    { diasAtras: 12, hora: 11, tipo: "AJUSTE_NEGATIVO", origen: "BODEGA", cantidad: 1, usuario: "Laura Gómez", motivo: "Una unidad llegó con la caja rota y no se puede vender." },
    { diasAtras: 5, hora: 15, tipo: "REVERSO_VENTA", destino: "ALMACEN", cantidad: 1, usuario: "Carlos Ruiz", idVenta: venta },
    { diasAtras: 1, hora: 17, tipo: "SALIDA_VENTA", origen: "ALMACEN", cantidad: 3, usuario: "Julián Castro", idVenta: venta + 65 },
  ];

  let saldoBodega = 0;
  let saldoAlmacen = 0;
  let promedio = 0;

  return pasos.map((paso, i) => {
    const total = saldoBodega + saldoAlmacen;
    // Igual que la función: solo lo que entra desde fuera recalcula el promedio.
    const entraDeFuera = !paso.origen && paso.destino;
    const costoUnitario = paso.costo ?? promedio;
    if (entraDeFuera) {
      promedio =
        total + paso.cantidad > 0
          ? redondear((total * promedio + paso.cantidad * costoUnitario) / (total + paso.cantidad), 4)
          : costoUnitario;
    }

    const cantidadEn = (lugar: "BODEGA" | "ALMACEN", lado: "origen" | "destino") =>
      paso[lado] === lugar ? paso.cantidad : 0;
    saldoBodega += cantidadEn("BODEGA", "destino") - cantidadEn("BODEGA", "origen");
    saldoAlmacen += cantidadEn("ALMACEN", "destino") - cantidadEn("ALMACEN", "origen");

    const fecha = new Date();
    fecha.setDate(fecha.getDate() - paso.diasAtras);
    fecha.setHours(paso.hora, (i * 17) % 60, 0, 0);

    return {
      idMovimiento: producto.id * 100 + i + 1,
      fecha,
      tipo: paso.tipo,
      entradaBodega: cantidadEn("BODEGA", "destino"),
      salidaBodega: cantidadEn("BODEGA", "origen"),
      entradaAlmacen: cantidadEn("ALMACEN", "destino"),
      salidaAlmacen: cantidadEn("ALMACEN", "origen"),
      saldoBodega,
      saldoAlmacen,
      saldoTotal: saldoBodega + saldoAlmacen,
      costoUnitario: redondear(costoUnitario, 2),
      costoPromedio: redondear(promedio, 2),
      saldoValorizado: redondear((saldoBodega + saldoAlmacen) * promedio, 2),
      saldoCoincide: true,
      nombreUsuario: paso.usuario,
      idVenta: paso.idVenta ?? null,
      idPedido: null,
      documentoReferencia: paso.documento ?? null,
      motivo: paso.motivo ?? null,
    };
  });
}
