// SCRUM-123 (Camilo) — Puerta única hacia el backend de clientes. El modal
// "Buscar cliente" del POS llama a buscarClientes() y registrarCliente() sin
// saber si detrás está la API real o el mock.
//
// (Camilo, 2026-10-20) — AHORA SE USA LA API REAL POR DEFECTO: los endpoints
// de clientes de Ramón ya están en back-end y main, así que los clientes se
// guardan en la base de datos. Para volver al mock, en simoapp/.env.local
// poner NEXT_PUBLIC_CLIENTES_MOCK=true y reiniciar `npm run dev`.
//
// CONTRATO (el que ya implementó Ramón, no uno propuesto):
//   GET  /api/customers?q=<texto>&estado=true&limit=8
//        → 200 { data: [cliente], pagination }   (documento por prefijo,
//          nombre por contenido)
//   POST /api/customers  { tipo_identificacion, identificacion, nombre,
//                          telefono, correo, direccion }
//        → 201 { message, cliente }
//        → 409 { message, cliente }  si el documento ya existe (devuelve el
//          que ya estaba, para usarlo)
//        → 400 { message }           dato inválido
//   cliente = { id_cliente, tipo_identificacion, identificacion, nombre,
//               telefono, correo, direccion, estado, creado_en, actualizado_en }

import { isAxiosError } from "axios";
import apiClient from "@/lib/apiClient";
import type { Cliente, DatosClienteNuevo, TipoDocumento } from "./tipos";
import { normalizarDocumento } from "./validaciones";

const USAR_MOCK = process.env.NEXT_PUBLIC_CLIENTES_MOCK === "true";

// Cuántas sugerencias se piden al buscar.
const LIMITE_SUGERENCIAS = 8;

type TipoErrorCliente = "duplicado" | "datos_invalidos" | "sin_conexion" | "servidor";

export class ErrorCliente extends Error {
  tipo: TipoErrorCliente;
  /** Solo en "duplicado": el cliente que ya estaba registrado. */
  existente: Cliente | null;

  constructor(tipo: TipoErrorCliente, mensaje: string, existente: Cliente | null = null) {
    super(mensaje);
    this.name = "ErrorCliente";
    this.tipo = tipo;
    this.existente = existente;
  }
}

interface FilaCliente {
  id_cliente: number;
  tipo_identificacion: TipoDocumento;
  identificacion: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  estado: boolean;
}

function aCliente(fila: FilaCliente): Cliente {
  return {
    id: fila.id_cliente,
    tipoDocumento: fila.tipo_identificacion,
    documento: fila.identificacion,
    nombre: fila.nombre,
    telefono: fila.telefono,
    correo: fila.correo,
    direccion: fila.direccion,
    activo: fila.estado,
  };
}

function aErrorCliente(error: unknown): ErrorCliente {
  if (!isAxiosError(error)) return new ErrorCliente("servidor", "Error inesperado.");
  if (!error.response) return new ErrorCliente("sin_conexion", error.message);
  const { status, data } = error.response;
  const texto = typeof data?.message === "string" ? data.message : error.message;
  if (status === 409) {
    return new ErrorCliente("duplicado", texto, data?.cliente ? aCliente(data.cliente) : null);
  }
  if (status === 400) return new ErrorCliente("datos_invalidos", texto);
  return new ErrorCliente("servidor", texto);
}

/** Solo clientes activos: a uno inactivo no se le debe facturar. */
export async function buscarClientes(texto: string): Promise<Cliente[]> {
  if (USAR_MOCK) return buscarClientesMock(texto);

  try {
    const { data } = await apiClient.get("/customers", {
      params: { q: texto, estado: true, limit: LIMITE_SUGERENCIAS },
    });
    return (data.data as FilaCliente[]).map(aCliente);
  } catch (error) {
    throw aErrorCliente(error);
  }
}

export async function registrarCliente(datos: DatosClienteNuevo): Promise<Cliente> {
  // Los opcionales vacíos van como null, que el backend guarda como vacío.
  const cuerpo = {
    tipo_identificacion: datos.tipoDocumento,
    identificacion: normalizarDocumento(datos.documento),
    nombre: datos.nombre.trim().replace(/\s+/g, " "),
    telefono: datos.telefono.trim() || null,
    correo: datos.correo.trim().toLowerCase() || null,
    direccion: datos.direccion.trim() || null,
  };
  if (USAR_MOCK) return registrarClienteMock(cuerpo);

  try {
    const { data } = await apiClient.post("/customers", cuerpo);
    return aCliente(data.cliente);
  } catch (error) {
    throw aErrorCliente(error);
  }
}

export function mensajeErrorCliente(error: unknown): string {
  if (!(error instanceof ErrorCliente)) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  switch (error.tipo) {
    case "duplicado":
      return "Ese documento ya está registrado.";
    case "datos_invalidos":
      return error.message || "Hay datos inválidos. Revísalos.";
    case "sin_conexion":
      return "No pudimos conectar con el servidor. Revisa la conexión e inténtalo de nuevo.";
    case "servidor":
      return "El servidor tuvo un problema. Inténtalo de nuevo.";
  }
}

// ---------------------------------------------------------------------
// Mock: imita a /api/customers mientras no esté unido el backend de Ramón.
// Busca igual que él (documento por prefijo, nombre por contenido, solo
// activos) y tarda un poco, para ver el "Buscando...". Los clientes que se
// registran quedan en memoria hasta recargar la página.
// ---------------------------------------------------------------------
const clientesMock: FilaCliente[] = [
  { id_cliente: 1, tipo_identificacion: "CC", identificacion: "1090123456", nombre: "María Fernanda Rojas", telefono: "310 555 1234", correo: "mafe.rojas@correo.com", direccion: "Av. 0 # 12-34, Cúcuta", estado: true },
  { id_cliente: 2, tipo_identificacion: "CC", identificacion: "1090456789", nombre: "Carlos Andrés Peña", telefono: "315 222 9876", correo: null, direccion: null, estado: true },
  { id_cliente: 3, tipo_identificacion: "NIT", identificacion: "900123456-7", nombre: "Distribuciones El Trébol S.A.S.", telefono: "607 571 2233", correo: "compras@eltrebol.com", direccion: "Calle 10 # 5-20, Centro", estado: true },
  { id_cliente: 4, tipo_identificacion: "CC", identificacion: "60345678", nombre: "Luz Marina Contreras", telefono: "320 444 1100", correo: "luzmarina@correo.com", direccion: null, estado: true },
  { id_cliente: 5, tipo_identificacion: "CE", identificacion: "5123456", nombre: "José Gregorio Briceño", telefono: "312 888 4455", correo: null, direccion: "Barrio La Libertad", estado: true },
  { id_cliente: 6, tipo_identificacion: "NIT", identificacion: "901555888-1", nombre: "Papelería Escolar Norte", telefono: null, correo: "ventas@papelerianorte.co", direccion: "Av. Libertadores # 3-15", estado: true },
  { id_cliente: 7, tipo_identificacion: "CC", identificacion: "1093777222", nombre: "Andrea Carolina Mora", telefono: "301 777 2020", correo: null, direccion: null, estado: false },
  { id_cliente: 8, tipo_identificacion: "CC", identificacion: "1090999111", nombre: "Juan Sebastián Rincón", telefono: "318 123 4567", correo: "juanse.rincon@correo.com", direccion: null, estado: true },
];

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

async function buscarClientesMock(texto: string): Promise<Cliente[]> {
  await esperar(350);
  const termino = texto.trim().replace(/\s+/g, " ").toLowerCase();
  const documento = normalizarDocumento(texto);
  const buscaDocumento = /^[0-9A-Z-]+$/.test(documento);
  return clientesMock
    .filter(
      (c) =>
        c.estado &&
        ((buscaDocumento && c.identificacion.startsWith(documento)) ||
          c.nombre.toLowerCase().includes(termino)),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .slice(0, LIMITE_SUGERENCIAS)
    .map(aCliente);
}

async function registrarClienteMock(
  cuerpo: Omit<FilaCliente, "id_cliente" | "estado">,
): Promise<Cliente> {
  await esperar(600);
  const existente = clientesMock.find((c) => c.identificacion === cuerpo.identificacion);
  if (existente) {
    throw new ErrorCliente(
      "duplicado",
      "El documento de identidad ya se encuentra registrado.",
      aCliente(existente),
    );
  }
  const nuevo: FilaCliente = { ...cuerpo, id_cliente: clientesMock.length + 1, estado: true };
  clientesMock.push(nuevo);
  return aCliente(nuevo);
}
