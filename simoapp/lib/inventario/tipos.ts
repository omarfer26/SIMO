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

// SCRUM-38 (Camilo) — Tipos del ajuste manual de stock. Un ajuste es un
// movimiento AJUSTE_POSITIVO (suma a una ubicación) o AJUSTE_NEGATIVO (resta
// de una ubicación), y siempre lleva motivo (chk_movimiento_motivo_ajuste).
export type TipoAjuste = "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO";
export type Ubicacion = "BODEGA" | "ALMACEN";

// Lo que llena el Encargado de Inventario en el formulario. Quien registra
// (id_usuario) lo saca el backend del token.
export interface DatosAjuste {
  idProducto: number;
  tipo: TipoAjuste;
  ubicacion: Ubicacion;
  cantidad: number;
  justificacion: string;
}

// Lo que responde el servicio cuando el ajuste quedó registrado.
export interface AjusteRegistrado {
  idMovimiento: number;
  fecha: string;
  tipo: TipoAjuste;
  ubicacion: Ubicacion;
  cantidad: number;
  /** Saldos del producto DESPUÉS del ajuste. */
  saldoBodega: number;
  saldoAlmacen: number;
}
