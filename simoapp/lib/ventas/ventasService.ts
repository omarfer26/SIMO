// SCRUM-50 (Camilo) — Puerta única hacia el backend para registrar una venta
// del POS. El modal de confirmación llama a registrarVenta() sin saber si
// detrás hay una API real o el mock.
//
// CÓMO CAMBIAR DEL MOCK A LA API REAL: en simoapp/.env.local poner
//   NEXT_PUBLIC_VENTAS_MOCK=false
// y reiniciar `npm run dev`. Mientras esa variable no sea "false" se usa el
// mock, porque el backend (rama back-end, revisado el 2026-10-15) todavía no
// tiene ningún endpoint de ventas: solo las tablas en 005_ventas.sql.
//
// CONTRATO QUE SE LE PROPONE AL BACKEND (ver camilo-sanchez.md, SCRUM-50):
//   POST /api/sales
//   Recibe: {
//     metodo_pago: "EFECTIVO" | "NEQUI" | ...   (codigo de metodos_pago)
//     id_cliente: number | null                 (SCRUM-123; null = Consumidor final)
//     descuento, impuestos, subtotal, total,      (en pesos)
//     detalles: [{ id_producto, cantidad, precio_unitario }]
//   }
//   Responde 201: { message, venta: { id_venta, fecha_venta, total } }
//   Errores: 400 dato inválido, 409 stock insuficiente (RN-01).
// El backend debe recalcular subtotal y total con sus propios precios y
// descontar el stock en la misma transacción (RN-02, RNF-04): lo que manda
// el frontend es solo para comparar, no para confiar en él.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { DatosVenta, VentaRegistrada } from "./tipos";

const USAR_MOCK = process.env.NEXT_PUBLIC_VENTAS_MOCK !== "false";

type TipoErrorVenta = "stock" | "datos_invalidos" | "sin_conexion" | "servidor";

export class ErrorVenta extends Error {
  tipo: TipoErrorVenta;

  constructor(tipo: TipoErrorVenta, mensaje: string) {
    super(mensaje);
    this.name = "ErrorVenta";
    this.tipo = tipo;
  }
}

export async function registrarVenta(datos: DatosVenta): Promise<VentaRegistrada> {
  if (USAR_MOCK) return registrarVentaMock(datos);

  try {
    const { data } = await apiClient.post("/sales", {
      metodo_pago: datos.metodoPago,
      id_cliente: datos.idCliente,
      id_vendedor: datos.idVendedor ?? null,
      subtotal: datos.subtotal,
      descuento: datos.descuento,
      impuestos: datos.impuestos,
      total: datos.total,
      detalles: datos.items.map((item) => ({
        id_producto: item.producto.id,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precioVenta,
      })),
    });
    return {
      idVenta: data.venta.id_venta,
      fecha: data.venta.fecha_venta,
      total: Number(data.venta.total),
    };
  } catch (error) {
    if (!isAxiosError(error)) throw new ErrorVenta("servidor", "Error inesperado.");
    if (!error.response) throw new ErrorVenta("sin_conexion", error.message);
    const mensaje: unknown = error.response.data?.message;
    const texto = typeof mensaje === "string" ? mensaje : error.message;
    if (error.response.status === 409) throw new ErrorVenta("stock", texto);
    if (error.response.status === 400) throw new ErrorVenta("datos_invalidos", texto);
    throw new ErrorVenta("servidor", texto);
  }
}

export function mensajeErrorVenta(error: unknown): string {
  if (!(error instanceof ErrorVenta)) {
    return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  }
  switch (error.tipo) {
    case "stock":
      return error.message || "Uno de los productos ya no tiene stock suficiente. Revisa la canasta.";
    case "datos_invalidos":
      return error.message || "Hay datos inválidos en la venta. Revísalos.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. La venta NO se registró; inténtalo de nuevo.";
    case "servidor":
      return "El servidor tuvo un problema. La venta NO se registró; inténtalo de nuevo.";
  }
}

// ---------------------------------------------------------------------
// Mock: imita al backend mientras no exista POST /api/sales. Tarda un poco
// (para ver el estado "Registrando venta...") y aplica la misma regla RN-01
// que debe aplicar el backend: no deja vender más de lo que hay en stock.
// No guarda la venta en ningún lado; solo devuelve un número consecutivo.
// ---------------------------------------------------------------------
let siguienteIdMock = 1001;

async function registrarVentaMock(datos: DatosVenta): Promise<VentaRegistrada> {
  await new Promise((resolver) => setTimeout(resolver, 700));

  const sinStock = datos.items.find((item) => item.cantidad > item.producto.stockActual);
  if (sinStock) {
    throw new ErrorVenta(
      "stock",
      `Stock insuficiente de ${sinStock.producto.nombre}: quedan ${sinStock.producto.stockActual}.`,
    );
  }

  return {
    idVenta: siguienteIdMock++,
    fecha: new Date().toISOString(),
    total: datos.total,
  };
}
