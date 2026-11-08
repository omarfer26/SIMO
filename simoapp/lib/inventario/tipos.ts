// SCRUM-124 (Camilo) — Tipos del traslado interno de mercancía. Siguen la
// tabla movimientos_inventario (backend/db/migrations/006_inventario.sql):
// un traslado es un movimiento TRASLADO_INTERNO que siempre va de BODEGA a
// ALMACEN (regla CU-06, chk_movimiento_ubicaciones).

// Lo que llena el Encargado de Inventario en el formulario.
export interface DatosTraslado {
  idProducto: number;
  cantidad: number;
  /** Usuario que entrega la mercancía y firma el traslado. */
  idResponsable: number;
  justificacion: string;
}

// Lo que responde el servicio cuando el traslado quedó registrado.
export interface TrasladoRegistrado {
  idMovimiento: number;
  fecha: string;
  cantidad: number;
  /** Saldos del producto DESPUÉS del traslado. */
  saldoBodega: number;
  saldoAlmacen: number;
}
