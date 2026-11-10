// SCRUM-Anulacion — Puerta única para el historial de ventas y la anulación
// con autorización gerencial.
//
// (Camilo, 2026-11-10) — La API real es el comportamiento por defecto: el
// backend ya expone GET /api/sales y POST /api/sales/:id/cancel (rama
// back-end, Sprint 3). El historial local (localStorage + datos semilla) solo
// se usa si en simoapp/.env.local se pone NEXT_PUBLIC_VENTAS_MOCK=true.
// Con la API real ya no hay respaldo silencioso: si el servidor falla, la
// pantalla muestra el error en vez de ventas inventadas.

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import { iniciarSesion } from "@/lib/auth/authService";
import type {
  DatosAnulacionVenta,
  DatosVenta,
  ResultadoAnulacion,
  VentaHistorial,
  VentaRegistrada,
} from "./tipos";
import { resumirSoporte } from "./soportePago";
// Historial de ejemplo (180 días de operación). Vive en su propio archivo
// para no llenar este servicio de datos de prueba.
import { ventasSemilla } from "./semillaVentas";

const USAR_MOCK = process.env.NEXT_PUBLIC_VENTAS_MOCK === "true";
const STORAGE_VENTAS_KEY = "simo.ventas.historial";
// Marca de la versión de las semillas guardadas en el navegador. Cuando los
// datos de ejemplo cambian (v2: historial de 90 días para el Dashboard
// Operacional; v3: 180 días, para que el período de 90 días tenga con qué
// compararse) se reemplaza el historial local UNA sola vez; de ahí en
// adelante se respeta lo que haya, incluidas las ventas registradas en el
// POS. Son datos de demostración: el historial real viene de GET /api/sales.
const STORAGE_SEMILLA_VERSION = "simo.ventas.semilla.version";
const VERSION_SEMILLA = 3;

type TipoErrorAnulacion =
  | "credenciales_invalidas"
  | "rol_no_autorizado"
  | "venta_no_encontrada"
  | "ya_anulada"
  | "motivo_requerido"
  | "sin_conexion"
  | "servidor";

export class ErrorAnulacion extends Error {
  tipo: TipoErrorAnulacion;

  constructor(tipo: TipoErrorAnulacion, mensaje: string) {
    super(mensaje);
    this.name = "ErrorAnulacion";
    this.tipo = tipo;
  }
}

function leerHistorialLocal(): VentaHistorial[] {
  if (typeof window === "undefined") return ventasSemilla;
  try {
    const versionSemilla = Number(localStorage.getItem(STORAGE_SEMILLA_VERSION) ?? 0);
    if (versionSemilla < VERSION_SEMILLA) {
      guardarHistorialLocal(ventasSemilla);
      localStorage.setItem(STORAGE_SEMILLA_VERSION, String(VERSION_SEMILLA));
      return ventasSemilla;
    }

    const raw = localStorage.getItem(STORAGE_VENTAS_KEY);
    if (!raw) {
      guardarHistorialLocal(ventasSemilla);
      return ventasSemilla;
    }
    return JSON.parse(raw) as VentaHistorial[];
  } catch {
    return ventasSemilla;
  }
}

function guardarHistorialLocal(lista: VentaHistorial[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_VENTAS_KEY, JSON.stringify(lista));
  } catch (err) {
    console.error("Error guardando historial de ventas local:", err);
  }
}

/**
 * Guarda en el historial una nueva venta recién completada en el POS.
 */
export function anexarVentaHistorial(
  venta: VentaRegistrada,
  datos: DatosVenta,
  nombreVendedor?: string,
  nombreCliente?: string,
  docCliente?: string,
) {
  const lista = USAR_MOCK ? leerHistorialLocal() : [];
  const nuevaVenta: VentaHistorial = {
    idVenta: venta.idVenta,
    fecha: venta.fecha,
    total: datos.total,
    subtotal: datos.subtotal,
    descuento: datos.descuento,
    impuestos: datos.impuestos,
    metodoPago: datos.metodoPago,
    // SCRUM-73 (Camilo) — Se guarda el código y los datos del comprobante
    // (nombre, tipo y tamaño), no el archivo: no cabe en el navegador.
    soportePago: datos.soportePago ? resumirSoporte(datos.soportePago) : null,
    estado: "COMPLETADA",
    cliente: {
      id: datos.idCliente,
      nombre: nombreCliente || (datos.idCliente ? `Cliente #${datos.idCliente}` : "Consumidor Final"),
      documento: docCliente,
    },
    vendedor: {
      id: datos.idVendedor ?? null,
      nombre: nombreVendedor || "Vendedor en Turno",
    },
    items: datos.items.map((i) => ({
      idProducto: i.producto.id,
      nombreProducto: i.producto.nombre,
      codigoProducto: i.producto.codigo,
      cantidad: i.cantidad,
      precioUnitario: i.producto.precioVenta,
      subtotal: i.producto.precioVenta * i.cantidad,
    })),
  };

  // (Camilo) — Con la API real la venta ya quedó guardada en la base; esto
  // solo arma la fila para mostrarla en pantalla sin volver a pedir la lista.
  if (USAR_MOCK) guardarHistorialLocal([nuevaVenta, ...lista]);
  return nuevaVenta;
}

/**
 * Obtiene el historial de ventas registrado en el sistema.
 */
export async function listarVentas(): Promise<VentaHistorial[]> {
  if (USAR_MOCK) {
    await new Promise((res) => setTimeout(res, 300));
    return leerHistorialLocal();
  }

  // (Camilo) — Sin respaldo local: si la API falla, el error llega a la
  // pantalla (Dashboard y /ventas lo muestran) en vez de ventas de prueba.
  const { data } = await apiClient.get("/sales");
  return (data.data ?? []) as VentaHistorial[];
}

/**
 * Anula una venta solicitando validación de credenciales gerenciales.
 * Solo usuarios con rol GERENTE o ADMIN pueden autorizar la anulación.
 */
export async function anularVenta(
  datos: DatosAnulacionVenta,
): Promise<ResultadoAnulacion> {
  const motivoLimpio = datos.motivo.trim();
  if (motivoLimpio.length < 5) {
    throw new ErrorAnulacion(
      "motivo_requerido",
      "Debe ingresar un motivo detallado para justificar la anulación (mínimo 5 caracteres).",
    );
  }

  // 3. API real (comportamiento por defecto). El backend valida las
  // credenciales y el rol del autorizador (CU-11), así que no hace falta
  // iniciar sesión aparte con ellas.
  if (!USAR_MOCK) return anularVentaApi(datos, motivoLimpio);

  // 1. Mock: validar credenciales y perfil gerencial
  let sesionAutorizador;
  try {
    sesionAutorizador = await iniciarSesion({
      correo: datos.credenciales.correo,
      password: datos.credenciales.password,
    });
  } catch {
    throw new ErrorAnulacion(
      "credenciales_invalidas",
      "Credenciales gerenciales incorrectas o usuario inactivo.",
    );
  }

  const rol = sesionAutorizador.usuario.rol;
  if (rol !== "GERENTE" && rol !== "ADMIN") {
    throw new ErrorAnulacion(
      "rol_no_autorizado",
      `Acceso denegado: El usuario autenticado tiene rol '${rol}'. Solo un GERENTE o ADMINISTRADOR puede autorizar anulaciones.`,
    );
  }

  // 2. Si usamos Mock / Fallback
  if (USAR_MOCK) {
    await new Promise((res) => setTimeout(res, 600));
    const lista = leerHistorialLocal();
    const indice = lista.findIndex((v) => v.idVenta === datos.idVenta);

    if (indice === -1) {
      throw new ErrorAnulacion("venta_no_encontrada", `No se encontró la venta #${datos.idVenta}.`);
    }

    if (lista[indice].estado === "ANULADA") {
      throw new ErrorAnulacion("ya_anulada", `La venta #${datos.idVenta} ya se encuentra anulada.`);
    }

    const fechaAhora = new Date().toISOString();
    lista[indice] = {
      ...lista[indice],
      estado: "ANULADA",
      anulacion: {
        fecha: fechaAhora,
        autorizadoPor: sesionAutorizador.usuario.correo,
        idAutorizador: sesionAutorizador.usuario.id,
        rolAutorizador: rol,
        motivo: motivoLimpio,
      },
    };

    guardarHistorialLocal(lista);

    return {
      idVenta: datos.idVenta,
      fechaAnulacion: fechaAhora,
      autorizadoPor: {
        id: sesionAutorizador.usuario.id,
        nombre: sesionAutorizador.usuario.correo,
        rol,
      },
      mensaje: `Venta #${datos.idVenta} anulada exitosamente con autorización de ${rol}.`,
    };
  }

  throw new ErrorAnulacion("servidor", "Modo de anulación no reconocido.");
}

// (Camilo) — Anulación contra POST /api/sales/:id/cancel. El backend devuelve
// quién autorizó (autorizado_por) para pintarlo en el historial.
async function anularVentaApi(
  datos: DatosAnulacionVenta,
  motivoLimpio: string,
): Promise<ResultadoAnulacion> {
  try {
    const { data } = await apiClient.post(`/sales/${datos.idVenta}/cancel`, {
      motivo: motivoLimpio,
      auth_email: datos.credenciales.correo.trim().toLowerCase(),
      auth_password: datos.credenciales.password,
    });

    return {
      idVenta: datos.idVenta,
      fechaAnulacion: data.fecha || new Date().toISOString(),
      autorizadoPor: {
        id: Number(data.autorizado_por?.id ?? 0),
        nombre: data.autorizado_por?.nombre || datos.credenciales.correo,
        rol: data.autorizado_por?.rol ?? "",
      },
      mensaje: data.message || `Venta #${datos.idVenta} anulada exitosamente.`,
    };
  } catch (error) {
    if (!isAxiosError(error)) {
      throw new ErrorAnulacion("servidor", "Error inesperado al anular la venta.");
    }
    if (!error.response) {
      throw new ErrorAnulacion("sin_conexion", "No se pudo conectar con el servidor.");
    }
    const mensaje = error.response.data?.message || error.message;
    if (error.response.status === 401) {
      throw new ErrorAnulacion("credenciales_invalidas", mensaje);
    }
    if (error.response.status === 403) {
      throw new ErrorAnulacion("rol_no_autorizado", mensaje);
    }
    if (error.response.status === 404) {
      throw new ErrorAnulacion("venta_no_encontrada", mensaje);
    }
    if (error.response.status === 409) {
      throw new ErrorAnulacion("ya_anulada", mensaje);
    }
    throw new ErrorAnulacion("servidor", mensaje);
  }
}
