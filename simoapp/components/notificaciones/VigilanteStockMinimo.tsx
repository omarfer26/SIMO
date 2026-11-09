"use client";

// Centro de notificaciones — Vigilante del stock mínimo.
//
// Componente sin pantalla (devuelve null): es el que convierte el estado del
// catálogo en avisos. Se monta una vez en app/(protected)/layout.tsx, dentro de
// ProductosProvider y NotificacionesProvider, y hace dos cosas:
//
//  1. BARRIDO REACTIVO. Cada vez que cambia la lista de productos, compara el
//     estado de stock anterior con el actual (lib/inventario/alertasStock) y
//     lanza los Toasts de los que cruzaron una frontera. Como ProductosContext
//     es el que muta el stock al cerrar una venta (descontarStock), al anularla
//     (reponerStock), al trasladar (actualizarUbicaciones) y al crear un
//     producto, el aviso aparece en el mismo instante en que pasa la venta — sin
//     código de notificación dentro del POS.
//
//  2. REVALIDACIÓN PERIÓDICA. Cada NEXT_PUBLIC_ALERTAS_STOCK_INTERVALO_MIN
//     minutos vuelve a leer GET /api/products, para que también se notifique lo
//     que pasó en otra caja o en un ingreso a bodega hecho por otro usuario. No
//     sondea con la pestaña oculta ni sin conexión.
//     El endpoint propio de alertas (p. ej. GET /api/inventory/alerts) no
//     existe hoy en el backend — revisado 2026-10-31, /api/inventory solo tiene
//     entries y purchases — así que la regla se aplica aquí, sobre el catálogo
//     que ya se descarga. Si el backend llegara a exponerlo, solo hay que
//     cambiar de dónde se toma `productos`; los mensajes y la pantalla no se
//     tocan.
//
// El PRIMER barrido no lanza Toasts: deja el inventario pendiente en el Banner y
// en la Campana. Abrir la app y recibir diez avisos flotantes por algo que ya
// se sabía sería ruido, no una alerta.

import { useEffect, useRef } from "react";
import { useProductos } from "@/components/catalogo/ProductosContext";
import {
  detectarCambios,
  instantaneaStock,
  resumirAlertas,
  type InstantaneaStock,
} from "@/lib/inventario/alertasStock";
import { ALERTAS_STOCK_ACTIVAS, INTERVALO_REVALIDACION_MS } from "@/lib/notificaciones/config";
import {
  notificacionInventarioRegularizado,
  notificacionRevalidacionFallida,
  notificacionesDesdeCambios,
} from "@/lib/notificaciones/mensajes";
import { useConexion } from "@/lib/red/useConexion";
import { useNotificaciones } from "./NotificacionesContext";

export default function VigilanteStockMinimo() {
  const { productos, origen, refrescarProductos } = useProductos();
  const { notificar } = useNotificaciones();
  const enLinea = useConexion();

  // Foto del stock del barrido anterior. `null` = todavía no se ha barrido nada.
  const fotoAnterior = useRef<Map<number, InstantaneaStock> | null>(null);

  useEffect(() => {
    if (!ALERTAS_STOCK_ACTIVAS) return;
    // Con el catálogo vacío o aún cargando no hay nada que comparar.
    if (origen === "cargando" || productos.length === 0) return;

    const anteriores = fotoAnterior.current;
    const cambios = detectarCambios(anteriores ?? new Map(), productos);
    fotoAnterior.current = instantaneaStock(productos);

    if (anteriores === null) return;

    const opciones = { dePrueba: origen === "respaldo" };
    for (const aviso of notificacionesDesdeCambios(cambios, opciones)) {
      notificar(aviso);
    }

    // Si después del barrido no queda ningún pendiente, se celebra el silencio:
    // normalmente significa que entró mercancía a bodega.
    if (cambios.length > 0 && resumirAlertas(productos).total === 0) {
      notificar(notificacionInventarioRegularizado());
    }
  }, [productos, origen, notificar]);

  useEffect(() => {
    if (!ALERTAS_STOCK_ACTIVAS) return;
    if (INTERVALO_REVALIDACION_MS === null) return;
    if (!enLinea) return;

    const temporizador = setInterval(async () => {
      // Pestaña oculta = no se mira; se revalida al volver a ponerla adelante
      // (o en el siguiente tick), sin gastarle peticiones al servidor.
      if (document.visibilityState !== "visible") return;

      const sincronizado = await refrescarProductos();
      if (!sincronizado) notificar(notificacionRevalidacionFallida());
    }, INTERVALO_REVALIDACION_MS);

    return () => clearInterval(temporizador);
  }, [enLinea, refrescarProductos, notificar]);

  return null;
}
