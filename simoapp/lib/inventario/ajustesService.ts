// SCRUM-38 (Camilo) — Puerta única hacia el backend para registrar un
// ajuste manual de stock. El formulario llama a registrarAjuste() sin saber
// si detrás hay una API real o el mock. Sigue el mismo molde que
// trasladosService.ts (SCRUM-124).
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_AJUSTES_MOCK=false
// y reiniciar `npm run dev`. Mientras no sea "false" se usa el mock, porque
// ninguna rama del backend tiene todavía un endpoint de ajustes (revisado
// el 2026-10-25: solo existen las reglas en la base, migraciones 006 y 007).
//
// CONTRATO QUE SE LE PROPONE AL BACKEND (mismo estilo que
// POST /api/inventory/entries, ver camilo-sanchez.md, SCRUM-38):
//   POST /api/inventory/adjustments   (roles INVENTARIO y ADMIN)
//   Recibe: { id_producto, tipo_movimiento, ubicacion, cantidad, motivo }
//     - tipo_movimiento: "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO"
//     - ubicacion: "BODEGA" | "ALMACEN" (va a ubicacion_destino si es
//       positivo y a ubicacion_origen si es negativo)
//     - id_usuario (quien registra) sale del token, no del cuerpo.
//   Responde 201: { message, ajuste: { id_movimiento, fecha_movimiento,
//                   tipo_movimiento, ubicacion, cantidad, saldo_bodega,
//                   saldo_almacen } }
//   Errores: 400 dato inválido o sin motivo · 404 producto no existe ·
//            409 stock insuficiente en la ubicación (ajuste negativo)
// En la misma transacción debe bloquear el producto (SELECT ... FOR UPDATE),
// cambiar el stock, insertar el movimiento e insertar en log_auditoria la
// acción AJUSTE_INVENTARIO con la justificación (migración 007).

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { Producto } from "@/components/catalogo/tipos";
import type { AjusteRegistrado, DatosAjuste } from "./tipos";
import { NOMBRE_UBICACION } from "./validaciones";

const USAR_MOCK = process.env.NEXT_PUBLIC_AJUSTES_MOCK !== "false";

type TipoErrorAjuste = "stock" | "no_existe" | "datos_invalidos" | "sin_conexion" | "servidor";

export class ErrorAjuste extends Error {
  tipo: TipoErrorAjuste;

  constructor(tipo: TipoErrorAjuste, mensaje: string) {
    super(mensaje);
    this.name = "ErrorAjuste";
    this.tipo = tipo;
  }
}

/** `producto` solo lo usa el mock, para revisar el stock como lo haría el backend. */
export async function registrarAjuste(
  datos: DatosAjuste,
  producto: Producto,
): Promise<AjusteRegistrado> {
  if (USAR_MOCK) return registrarAjusteMock(datos, producto);

  try {
    const { data } = await apiClient.post("/inventory/adjustments", {
      id_producto: datos.idProducto,
      tipo_movimiento: datos.tipo,
      ubicacion: datos.ubicacion,
      cantidad: datos.cantidad,
      motivo: datos.justificacion.trim(),
    });
    const a = data.ajuste;
    // NUMERIC de PostgreSQL llega como texto ("12.000").
    return {
      idMovimiento: Number(a.id_movimiento),
      fecha: a.fecha_movimiento,
      tipo: a.tipo_movimiento,
      ubicacion: a.ubicacion,
      cantidad: Number(a.cantidad),
      saldoBodega: Number(a.saldo_bodega),
      saldoAlmacen: Number(a.saldo_almacen),
    };
  } catch (error) {
    if (!isAxiosError(error)) throw new ErrorAjuste("servidor", "Error inesperado.");
    if (!error.response) throw new ErrorAjuste("sin_conexion", error.message);
    const mensaje: unknown = error.response.data?.message;
    const texto = typeof mensaje === "string" ? mensaje : error.message;
    if (error.response.status === 409) throw new ErrorAjuste("stock", texto);
    if (error.response.status === 404) throw new ErrorAjuste("no_existe", texto);
    if (error.response.status === 400) throw new ErrorAjuste("datos_invalidos", texto);
    throw new ErrorAjuste("servidor", texto);
  }
}

export function mensajeErrorAjuste(error: unknown): string {
  if (!(error instanceof ErrorAjuste)) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  switch (error.tipo) {
    case "stock":
      return error.message || "Ya no hay suficiente stock para restar. Recarga el catálogo y revisa.";
    case "no_existe":
      return "El producto ya no existe en el inventario.";
    case "datos_invalidos":
      return error.message || "Hay datos inválidos en el ajuste. Revísalos.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. El ajuste NO se registró; inténtalo de nuevo.";
    case "servidor":
      return "El servidor tuvo un problema. El ajuste NO se registró; inténtalo de nuevo.";
  }
}

// ---------------------------------------------------------------------
// Mock: imita al backend mientras no exista el endpoint. Tarda un poco
// (para ver el "Registrando ajuste...") y aplica la misma regla que la
// base: un saldo no puede quedar negativo. No guarda nada.
// ---------------------------------------------------------------------
let siguienteIdMock = 6001;

// Redondeo a 3 decimales, como NUMERIC(12,3) en la base.
const redondear = (valor: number) => Math.round(valor * 1000) / 1000;

async function registrarAjusteMock(datos: DatosAjuste, producto: Producto): Promise<AjusteRegistrado> {
  await new Promise((resolver) => setTimeout(resolver, 700));

  const enBodega = datos.ubicacion === "BODEGA";
  const disponible = enBodega ? producto.stockBodega : producto.stockAlmacen;
  const signo = datos.tipo === "AJUSTE_POSITIVO" ? 1 : -1;

  if (signo < 0 && datos.cantidad > disponible) {
    throw new ErrorAjuste(
      "stock",
      `Stock insuficiente en ${NOMBRE_UBICACION[datos.ubicacion]} de ${producto.nombre}: quedan ${disponible}.`,
    );
  }

  const nuevoSaldo = redondear(disponible + signo * datos.cantidad);
  return {
    idMovimiento: siguienteIdMock++,
    fecha: new Date().toISOString(),
    tipo: datos.tipo,
    ubicacion: datos.ubicacion,
    cantidad: datos.cantidad,
    saldoBodega: enBodega ? nuevoSaldo : producto.stockBodega,
    saldoAlmacen: enBodega ? producto.stockAlmacen : nuevoSaldo,
  };
}
