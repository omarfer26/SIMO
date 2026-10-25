// SCRUM-Anulacion — Puerta única para el historial de ventas y la anulación
// con autorización gerencial.
// Soporta tanto la API del backend como persistencia local (localStorage)
// y datos semilla para pruebas inmediatas.

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

const USAR_MOCK = process.env.NEXT_PUBLIC_VENTAS_MOCK !== "false";
const STORAGE_VENTAS_KEY = "simo.ventas.historial";

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

// Semillas iniciales para que la interfaz cuente con historial desde el primer momento
const ventasSemilla: VentaHistorial[] = [
  {
    idVenta: 1001,
    fecha: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // hace 45 minutos
    metodoPago: "EFECTIVO",
    estado: "COMPLETADA",
    subtotal: 120000,
    descuento: 0,
    impuestos: 0,
    total: 120000,
    cliente: { id: 1, nombre: "Carlos Gómez", documento: "1090123456" },
    vendedor: { id: 4, nombre: "Vendedor SIMO" },
    items: [
      {
        idProducto: 1,
        codigoProducto: "PROD-001",
        nombreProducto: "Taladro Percutor 650W",
        cantidad: 1,
        precioUnitario: 120000,
        subtotal: 120000,
      },
    ],
  },
  {
    idVenta: 1002,
    fecha: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // hace 15 minutos
    metodoPago: "NEQUI",
    estado: "COMPLETADA",
    subtotal: 95000,
    descuento: 5000,
    impuestos: 0,
    total: 90000,
    cliente: { id: null, nombre: "Consumidor Final" },
    vendedor: { id: 4, nombre: "Vendedor SIMO" },
    items: [
      {
        idProducto: 2,
        codigoProducto: "PROD-002",
        nombreProducto: "Caja de Herramientas 16 Pulgadas",
        cantidad: 1,
        precioUnitario: 70000,
        subtotal: 70000,
      },
      {
        idProducto: 3,
        codigoProducto: "PROD-003",
        nombreProducto: "Juego de Llaves Bristol 9 Piezas",
        cantidad: 1,
        precioUnitario: 25000,
        subtotal: 25000,
      },
    ],
  },
];

function leerHistorialLocal(): VentaHistorial[] {
  if (typeof window === "undefined") return ventasSemilla;
  try {
    const raw = localStorage.getItem(STORAGE_VENTAS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_VENTAS_KEY, JSON.stringify(ventasSemilla));
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
  const lista = leerHistorialLocal();
  const nuevaVenta: VentaHistorial = {
    idVenta: venta.idVenta,
    fecha: venta.fecha,
    total: datos.total,
    subtotal: datos.subtotal,
    descuento: datos.descuento,
    impuestos: datos.impuestos,
    metodoPago: datos.metodoPago,
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

  const actualizada = [nuevaVenta, ...lista];
  guardarHistorialLocal(actualizada);
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

  try {
    const { data } = await apiClient.get("/sales");
    return data.ventas || data.data || [];
  } catch {
    // Si falla la API del backend, respaldo local
    return leerHistorialLocal();
  }
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

  // 1. Validar credenciales y perfil gerencial
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

  // 3. Si se conecta a la API Real del backend
  try {
    const { data } = await apiClient.post(`/sales/${datos.idVenta}/cancel`, {
      motivo: motivoLimpio,
      auth_email: datos.credenciales.correo,
      auth_password: datos.credenciales.password,
    });

    return {
      idVenta: datos.idVenta,
      fechaAnulacion: data.fecha || new Date().toISOString(),
      autorizadoPor: {
        id: sesionAutorizador.usuario.id,
        nombre: sesionAutorizador.usuario.correo,
        rol,
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
