"use client";

// SCRUM-110 (Camilo) — Ejemplos de DataTable para la página /componentes:
// la misma tabla usada con tres juegos de datos distintos (Catálogo,
// Usuarios y Kardex), para mostrar que solo cambian las columnas. Los
// usuarios y los movimientos de Kardex son datos de prueba escritos aquí,
// porque esos módulos todavía no existen ni en el front ni en el backend;
// los productos sí vienen del ProductosContext del catálogo.

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import DataTable, { type ColumnaTabla } from "@/components/ui/DataTable";
import InputText from "@/components/ui/InputText";
import { useProductos } from "@/components/catalogo/ProductosContext";
import type { Producto } from "@/components/catalogo/tipos";
import type { RolUsuario } from "@/components/shell/tipos";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

function Etiqueta({ texto, color }: { texto: string; color: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      {texto}
    </span>
  );
}

// ---------- Catálogo ----------

const columnasProductos: ColumnaTabla<Producto>[] = [
  { key: "codigo", header: "Código", accessor: (p) => p.codigo, sortable: true },
  { key: "nombre", header: "Nombre", accessor: (p) => p.nombre, sortable: true },
  { key: "categoria", header: "Categoría", accessor: (p) => p.categoria, sortable: true },
  {
    key: "precioVenta",
    header: "Precio venta",
    accessor: (p) => p.precioVenta,
    render: (p) => formatoMoneda.format(p.precioVenta),
    sortable: true,
    align: "right",
  },
  {
    key: "stockActual",
    header: "Stock",
    accessor: (p) => p.stockActual,
    // En rojo si ya está en el mínimo o por debajo (alerta de stock).
    render: (p) => (
      <span
        className={
          p.stockActual <= p.stockMinimo
            ? "font-medium text-red-600 dark:text-red-400"
            : ""
        }
      >
        {p.stockActual}
      </span>
    ),
    sortable: true,
    align: "right",
  },
  {
    key: "estado",
    header: "Estado",
    accessor: (p) => p.estado,
    render: (p) => (
      <Etiqueta
        texto={p.estado}
        color={
          p.estado === "Activo"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        }
      />
    ),
    sortable: true,
  },
];

// ---------- Usuarios ----------

interface UsuarioEjemplo {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  estado: "Activo" | "Inactivo";
  ultimoIngreso: Date | null;
}

const usuariosMock: UsuarioEjemplo[] = [
  { id: 1, nombre: "Carlos Ruiz", correo: "carlos@simo.co", rol: "Administrador", estado: "Activo", ultimoIngreso: new Date(2026, 8, 23, 18, 10) },
  { id: 2, nombre: "Marta Díaz", correo: "marta@simo.co", rol: "Propietario", estado: "Activo", ultimoIngreso: new Date(2026, 8, 24, 8, 45) },
  { id: 3, nombre: "Laura Gómez", correo: "laura@simo.co", rol: "Vendedor", estado: "Activo", ultimoIngreso: new Date(2026, 8, 24, 9, 2) },
  { id: 4, nombre: "Andrés Pérez", correo: "andres@simo.co", rol: "Vendedor", estado: "Inactivo", ultimoIngreso: new Date(2026, 7, 30, 16, 20) },
  { id: 5, nombre: "Diana Rojas", correo: "diana@simo.co", rol: "Encargado de Inventario", estado: "Activo", ultimoIngreso: new Date(2026, 8, 22, 7, 55) },
  { id: 6, nombre: "Julián Castro", correo: "julian@simo.co", rol: "Vendedor", estado: "Activo", ultimoIngreso: null },
  { id: 7, nombre: "Ángela Mora", correo: "angela@simo.co", rol: "Encargado de Inventario", estado: "Activo", ultimoIngreso: new Date(2026, 8, 20, 14, 5) },
];

const columnasUsuarios: ColumnaTabla<UsuarioEjemplo>[] = [
  { key: "nombre", header: "Nombre", accessor: (u) => u.nombre, sortable: true },
  { key: "correo", header: "Correo", accessor: (u) => u.correo, sortable: true },
  { key: "rol", header: "Rol", accessor: (u) => u.rol, sortable: true },
  {
    key: "estado",
    header: "Estado",
    accessor: (u) => u.estado,
    render: (u) => (
      <Etiqueta
        texto={u.estado}
        color={
          u.estado === "Activo"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        }
      />
    ),
    sortable: true,
  },
  {
    // Sin `render`: la tabla muestra la fecha sola (y "—" si nunca entró).
    key: "ultimoIngreso",
    header: "Último ingreso",
    accessor: (u) => u.ultimoIngreso,
    sortable: true,
  },
];

// ---------- Kardex ----------

type TipoMovimiento = "Entrada" | "Salida" | "Ajuste";

interface MovimientoKardex {
  id: number;
  fecha: Date;
  codigoProducto: string;
  tipo: TipoMovimiento;
  cantidad: number;
  saldo: number;
  justificacion: string;
  usuario: string;
}

// 18 movimientos de prueba sobre 3 productos, con el saldo calculado en
// orden cronológico (como lo haría el Kardex real), para que al ordenar por
// fecha los saldos cuadren.
const movimientosKardex: MovimientoKardex[] = (() => {
  const base: Omit<MovimientoKardex, "id" | "saldo" | "fecha">[] = [
    { codigoProducto: "ELEC-001", tipo: "Entrada", cantidad: 20, justificacion: "Compra a proveedor", usuario: "Diana Rojas" },
    { codigoProducto: "ROPA-001", tipo: "Entrada", cantidad: 40, justificacion: "Compra a proveedor", usuario: "Diana Rojas" },
    { codigoProducto: "ELEC-001", tipo: "Salida", cantidad: -2, justificacion: "Venta #1001", usuario: "Laura Gómez" },
    { codigoProducto: "PAPE-001", tipo: "Entrada", cantidad: 25, justificacion: "Compra a proveedor", usuario: "Ángela Mora" },
    { codigoProducto: "ROPA-001", tipo: "Salida", cantidad: -5, justificacion: "Venta #1002", usuario: "Laura Gómez" },
    { codigoProducto: "ELEC-001", tipo: "Salida", cantidad: -1, justificacion: "Venta #1003", usuario: "Julián Castro" },
    { codigoProducto: "PAPE-001", tipo: "Salida", cantidad: -3, justificacion: "Pedido #210 en preparación", usuario: "Laura Gómez" },
    { codigoProducto: "ROPA-001", tipo: "Ajuste", cantidad: -2, justificacion: "Prendas con defecto de fábrica", usuario: "Diana Rojas" },
    { codigoProducto: "ELEC-001", tipo: "Entrada", cantidad: 1, justificacion: "Anulación venta #1003", usuario: "Carlos Ruiz" },
    { codigoProducto: "PAPE-001", tipo: "Salida", cantidad: -10, justificacion: "Venta #1004", usuario: "Julián Castro" },
    { codigoProducto: "ELEC-001", tipo: "Salida", cantidad: -4, justificacion: "Venta #1005", usuario: "Laura Gómez" },
    { codigoProducto: "ROPA-001", tipo: "Salida", cantidad: -8, justificacion: "Pedido #211 en preparación", usuario: "Julián Castro" },
    { codigoProducto: "PAPE-001", tipo: "Ajuste", cantidad: 2, justificacion: "Conteo físico: sobrante", usuario: "Ángela Mora" },
    { codigoProducto: "ELEC-001", tipo: "Salida", cantidad: -3, justificacion: "Venta #1006", usuario: "Laura Gómez" },
    { codigoProducto: "ROPA-001", tipo: "Entrada", cantidad: 8, justificacion: "Cancelación pedido #211", usuario: "Carlos Ruiz" },
    { codigoProducto: "PAPE-001", tipo: "Salida", cantidad: -6, justificacion: "Venta #1007", usuario: "Laura Gómez" },
    { codigoProducto: "ELEC-001", tipo: "Ajuste", cantidad: -1, justificacion: "Unidad dañada en bodega", usuario: "Diana Rojas" },
    { codigoProducto: "ROPA-001", tipo: "Salida", cantidad: -6, justificacion: "Venta #1008", usuario: "Julián Castro" },
  ];

  const saldos: Record<string, number> = {};
  return base.map((mov, i) => {
    saldos[mov.codigoProducto] = (saldos[mov.codigoProducto] ?? 0) + mov.cantidad;
    return {
      ...mov,
      id: i + 1,
      // Un movimiento cada ~9 horas desde el 15 de septiembre.
      fecha: new Date(2026, 8, 15, 8 + i * 9, (i * 17) % 60),
      saldo: saldos[mov.codigoProducto],
    };
  });
})();

const coloresTipo: Record<TipoMovimiento, string> = {
  Entrada: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Salida: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Ajuste: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

const columnasKardex: ColumnaTabla<MovimientoKardex>[] = [
  {
    key: "fecha",
    header: "Fecha",
    accessor: (m) => m.fecha,
    render: (m) => formatoFechaHora.format(m.fecha),
    sortable: true,
  },
  { key: "producto", header: "Producto", accessor: (m) => m.codigoProducto, sortable: true },
  {
    key: "tipo",
    header: "Tipo",
    accessor: (m) => m.tipo,
    render: (m) => <Etiqueta texto={m.tipo} color={coloresTipo[m.tipo]} />,
    sortable: true,
  },
  {
    key: "cantidad",
    header: "Cantidad",
    accessor: (m) => m.cantidad,
    render: (m) => (m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad),
    sortable: true,
    align: "right",
  },
  { key: "saldo", header: "Saldo", accessor: (m) => m.saldo, align: "right" },
  { key: "justificacion", header: "Causa / justificación", accessor: (m) => m.justificacion },
  { key: "usuario", header: "Usuario", accessor: (m) => m.usuario, sortable: true },
];

// ---------- Selector de ejemplo ----------

type Ejemplo = "catalogo" | "usuarios" | "kardex";

const nombresEjemplo: Record<Ejemplo, string> = {
  catalogo: "Catálogo",
  usuarios: "Usuarios",
  kardex: "Kardex",
};

export default function EjemplosTabla() {
  const { productos } = useProductos();
  const [ejemplo, setEjemplo] = useState<Ejemplo>("catalogo");
  const [busqueda, setBusqueda] = useState("");

  // El filtro es de la página, no de la tabla: la tabla recibe ya la lista
  // filtrada. Sirve para ver el mensaje de "sin resultados".
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return productos;
    return productos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(texto) ||
        p.nombre.toLowerCase().includes(texto),
    );
  }, [productos, busqueda]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ejemplo">
        {(Object.keys(nombresEjemplo) as Ejemplo[]).map((clave) => (
          <Button
            key={clave}
            variant={ejemplo === clave ? "primary" : "secondary"}
            aria-pressed={ejemplo === clave}
            onClick={() => setEjemplo(clave)}
          >
            {nombresEjemplo[clave]}
          </Button>
        ))}
      </div>

      {ejemplo === "catalogo" && (
        <>
          <InputText
            label="Buscar (filtro de la página, no de la tabla)"
            placeholder="Código o nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <DataTable
            caption="Productos del catálogo"
            columns={columnasProductos}
            data={productosFiltrados}
            getRowKey={(p) => p.id}
            pageSize={5}
            pageSizeOptions={[5, 10, 25]}
            emptyMessage="No se encontraron productos con esa búsqueda."
          />
        </>
      )}

      {ejemplo === "usuarios" && (
        <DataTable
          caption="Usuarios del sistema"
          columns={columnasUsuarios}
          data={usuariosMock}
          getRowKey={(u) => u.id}
          initialSort={{ key: "nombre", direction: "asc" }}
        />
      )}

      {ejemplo === "kardex" && (
        <DataTable
          caption="Movimientos de inventario (Kardex)"
          columns={columnasKardex}
          data={movimientosKardex}
          getRowKey={(m) => m.id}
          initialSort={{ key: "fecha", direction: "desc" }}
        />
      )}
    </div>
  );
}
