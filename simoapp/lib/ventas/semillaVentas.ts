// Historial de ventas de ejemplo para la demostración del sistema.
//
// Mientras el backend no exponga los endpoints de ventas
// (NEXT_PUBLIC_VENTAS_MOCK distinto de "false"), el POS y el Dashboard
// Operacional leen de acá. Se generan 180 días de operación con un
// generador pseudoaleatorio de semilla fija: el historial es el mismo en
// cada arranque (solo se corre la fecha de "hoy"), así los gráficos no
// cambian de un refresco a otro mientras se muestra el tablero.
//
// Son 180 y no 90 para que el período más largo del tablero (90 días)
// tenga también sus 90 días anteriores con los que comparar las variaciones.
//
// Los ids arrancan en 9001 para no chocar con las ventas que registra el
// POS (que empiezan en 1001). Cuando exista POST /api/sales este archivo
// se puede borrar.

import type { CodigoMetodoPago, VentaHistorial } from "./tipos";

const DIAS_DE_HISTORIAL = 180;
const PRIMER_ID_SEMILLA = 9001;

// Mismos id, código y precio que components/catalogo/productos.mock.ts: la
// rotación de stock cruza las líneas de venta con el catálogo por id.
const CATALOGO = [
  { idProducto: 1, codigoProducto: "ELEC-001", nombreProducto: "Audífonos Bluetooth X200", precio: 89900 },
  { idProducto: 2, codigoProducto: "ELEC-002", nombreProducto: "Cargador USB-C 20W", precio: 35000 },
  { idProducto: 4, codigoProducto: "ROPA-001", nombreProducto: "Camiseta algodón unisex", precio: 25000 },
  { idProducto: 5, codigoProducto: "ROPA-002", nombreProducto: "Gorra deportiva", precio: 20000 },
  { idProducto: 6, codigoProducto: "FERR-001", nombreProducto: "Martillo de uña 16oz", precio: 32000 },
  { idProducto: 7, codigoProducto: "FERR-002", nombreProducto: "Cinta métrica 5m", precio: 15000 },
  { idProducto: 8, codigoProducto: "PAPE-001", nombreProducto: "Resma de papel carta", precio: 22000 },
  { idProducto: 10, codigoProducto: "HOG-001", nombreProducto: "Juego de vasos x6", precio: 28000 },
  { idProducto: 11, codigoProducto: "HOG-002", nombreProducto: "Toalla de cocina", precio: 9000 },
  { idProducto: 12, codigoProducto: "ELEC-004", nombreProducto: "Power bank 10000mAh", precio: 65000 },
];

const METODOS: CodigoMetodoPago[] = [
  "EFECTIVO",
  "EFECTIVO",
  "EFECTIVO",
  "NEQUI",
  "NEQUI",
  "TARJETA",
  "TRANSFERENCIA",
  "DAVIPLATA",
];

const CLIENTES = [
  null,
  null,
  null,
  { id: 1, nombre: "Carlos Gómez", documento: "1090123456" },
  { id: 2, nombre: "María Restrepo", documento: "1020456789" },
  { id: 3, nombre: "Ferretería El Tornillo", documento: "900123456" },
];

const MOTIVOS_ANULACION = [
  "Devolución de mercancía en tienda",
  "Cobro duplicado en caja",
  "Error del cajero al elegir el medio de pago",
];

// Generador congruencial lineal: rápido, sin dependencias y determinista.
function crearAleatorio(semilla: number) {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

function crearHistorial(): VentaHistorial[] {
  const aleatorio = crearAleatorio(20261026);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ventas: VentaHistorial[] = [];
  let idVenta = PRIMER_ID_SEMILLA;

  for (let diasAtras = DIAS_DE_HISTORIAL - 1; diasAtras >= 0; diasAtras--) {
    const dia = new Date(hoy);
    dia.setDate(dia.getDate() - diasAtras);

    // Los domingos casi no se abre y los sábados se vende menos.
    const diaSemana = dia.getDay();
    const maximoVentas = diaSemana === 0 ? 1 : diaSemana === 6 ? 2 : 4;
    const ventasDelDia = Math.floor(aleatorio() * (maximoVentas + 1));

    for (let n = 0; n < ventasDelDia; n++) {
      const fecha = new Date(dia);
      fecha.setHours(8 + Math.floor(aleatorio() * 11), Math.floor(aleatorio() * 60), 0, 0);

      // De 1 a 3 productos distintos por venta.
      const items: VentaHistorial["items"] = [];
      const lineas = 1 + Math.floor(aleatorio() * 3);
      for (let linea = 0; linea < lineas; linea++) {
        const producto = CATALOGO[Math.floor(aleatorio() * CATALOGO.length)];
        if (items.some((item) => item.idProducto === producto.idProducto)) continue;

        const cantidad = 1 + Math.floor(aleatorio() * 2);
        items.push({
          idProducto: producto.idProducto,
          codigoProducto: producto.codigoProducto,
          nombreProducto: producto.nombreProducto,
          cantidad,
          precioUnitario: producto.precio,
          subtotal: producto.precio * cantidad,
        });
      }
      if (items.length === 0) continue;

      const subtotal = items.reduce((suma, item) => suma + item.subtotal, 0);
      const conDescuento = aleatorio() < 0.2;
      const descuento = conDescuento ? Math.round((subtotal * 0.05) / 100) * 100 : 0;
      const anulada = aleatorio() < 0.05;

      ventas.push({
        idVenta: idVenta++,
        fecha: fecha.toISOString(),
        subtotal,
        descuento,
        impuestos: 0,
        total: subtotal - descuento,
        metodoPago: METODOS[Math.floor(aleatorio() * METODOS.length)],
        estado: anulada ? "ANULADA" : "COMPLETADA",
        cliente: CLIENTES[Math.floor(aleatorio() * CLIENTES.length)],
        vendedor: { id: 4, nombre: "Vendedor SIMO" },
        items,
        ...(anulada
          ? {
              anulacion: {
                fecha: fecha.toISOString(),
                autorizadoPor: "admin@simo.com",
                idAutorizador: 1,
                rolAutorizador: "ADMIN",
                motivo: MOTIVOS_ANULACION[Math.floor(aleatorio() * MOTIVOS_ANULACION.length)],
              },
            }
          : {}),
      });
    }
  }

  // El historial se muestra del más reciente al más antiguo.
  return ventas.reverse();
}

export const ventasSemilla: VentaHistorial[] = crearHistorial();
