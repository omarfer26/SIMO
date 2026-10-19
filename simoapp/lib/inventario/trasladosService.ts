// SCRUM-124 (Camilo) — Puerta única hacia el backend para registrar un
// traslado Bodega → Almacén. El formulario llama a registrarTraslado() sin
// saber si detrás hay una API real o el mock.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_TRASLADOS_MOCK=false
// y reiniciar `npm run dev`. Mientras no sea "false" se usa el mock, porque
// ninguna rama del backend tiene todavía un endpoint de traslados (revisado
// el 2026-10-16: solo existe la regla en la tabla, migración 006).
//
// CONTRATO QUE SE LE PROPONE AL BACKEND (mismo estilo que el
// POST /api/inventory/entries de Ramón, ver camilo-sanchez.md, SCRUM-124):
//   POST /api/inventory/transfers
//   Recibe: { id_producto, cantidad, id_responsable, motivo }
//     - id_usuario (quien registra) sale del token, no del cuerpo.
//     - id_responsable es quien entrega y firma. Hoy no hay columna para
//       él en movimientos_inventario: hay que agregarla (o guardarlo en
//       documento_referencia) si es distinto de quien registra.
//   Responde 201: { message, traslado: { id_movimiento, fecha_movimiento,
//                   cantidad, saldo_bodega, saldo_almacen } }
//   Errores: 400 dato inválido · 404 producto no existe ·
//            409 stock insuficiente en Bodega (RN-01)
// Debe bloquear el producto (SELECT ... FOR UPDATE), restar de stock_bodega,
// sumar a stock_almacen e insertar el movimiento TRASLADO_INTERNO en la
// misma transacción, como fn_registrar_ingreso_bodega (migración 008).

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { Producto } from "@/components/catalogo/tipos";
import type { DatosTraslado, TrasladoRegistrado } from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_TRASLADOS_MOCK !== "false";

type TipoErrorTraslado = "stock" | "no_existe" | "datos_invalidos" | "sin_conexion" | "servidor";

export class ErrorTraslado extends Error {
  tipo: TipoErrorTraslado;

  constructor(tipo: TipoErrorTraslado, mensaje: string) {
    super(mensaje);
    this.name = "ErrorTraslado";
    this.tipo = tipo;
  }
}

/** `producto` solo lo usa el mock, para revisar el stock como lo haría el backend. */
export async function registrarTraslado(
  datos: DatosTraslado,
  producto: Producto,
): Promise<TrasladoRegistrado> {
  if (USAR_MOCK) return registrarTrasladoMock(datos, producto);

  try {
    const { data } = await apiClient.post("/inventory/transfers", {
      id_producto: datos.idProducto,
      cantidad: datos.cantidad,
      id_responsable: datos.idResponsable,
      motivo: datos.justificacion.trim(),
    });
    const t = data.traslado;
    // NUMERIC de PostgreSQL llega como texto ("12.000").
    return {
      idMovimiento: Number(t.id_movimiento),
      fecha: t.fecha_movimiento,
      cantidad: Number(t.cantidad),
      saldoBodega: Number(t.saldo_bodega),
      saldoAlmacen: Number(t.saldo_almacen),
    };
  } catch (error) {
    if (!isAxiosError(error)) throw new ErrorTraslado("servidor", "Error inesperado.");
    if (!error.response) throw new ErrorTraslado("sin_conexion", error.message);
    const mensaje: unknown = error.response.data?.message;
    const texto = typeof mensaje === "string" ? mensaje : error.message;
    if (error.response.status === 409) throw new ErrorTraslado("stock", texto);
    if (error.response.status === 404) throw new ErrorTraslado("no_existe", texto);
    if (error.response.status === 400) throw new ErrorTraslado("datos_invalidos", texto);
    throw new ErrorTraslado("servidor", texto);
  }
}

export function mensajeErrorTraslado(error: unknown): string {
  if (!(error instanceof ErrorTraslado)) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  switch (error.tipo) {
    case "stock":
      return error.message || "Ya no hay suficiente stock en Bodega. Recarga el catálogo y revisa.";
    case "no_existe":
      return "El producto ya no existe en el inventario.";
    case "datos_invalidos":
      return error.message || "Hay datos inválidos en el traslado. Revísalos.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. El traslado NO se registró; inténtalo de nuevo.";
    case "servidor":
      return "El servidor tuvo un problema. El traslado NO se registró; inténtalo de nuevo.";
  }
}

// ---------------------------------------------------------------------
// Mock: imita al backend mientras no exista el endpoint. Tarda un poco
// (para ver el "Registrando traslado...") y aplica la misma regla que la
// base: no se puede sacar de Bodega más de lo que hay. No guarda nada.
// ---------------------------------------------------------------------
let siguienteIdMock = 5001;

const redondear = (valor: number) => Math.round(valor * 1000) / 1000;

async function registrarTrasladoMock(
  datos: DatosTraslado,
  producto: Producto,
): Promise<TrasladoRegistrado> {
  await new Promise((resolver) => setTimeout(resolver, 700));

  if (datos.cantidad > producto.stockBodega) {
    throw new ErrorTraslado(
      "stock",
      `Stock insuficiente en Bodega de ${producto.nombre}: quedan ${producto.stockBodega}.`,
    );
  }

  return {
    idMovimiento: siguienteIdMock++,
    fecha: new Date().toISOString(),
    cantidad: datos.cantidad,
    // Redondeo a 3 decimales, como NUMERIC(12,3) en la base (2.5 - 0.1 en
    // JavaScript da 2.4000000000000004).
    saldoBodega: redondear(producto.stockBodega - datos.cantidad),
    saldoAlmacen: redondear(producto.stockAlmacen + datos.cantidad),
  };
}
