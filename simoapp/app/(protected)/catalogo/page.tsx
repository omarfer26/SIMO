"use client";

// SCRUM-31 (Camilo) — Página en la ruta /catalogo. Pone el título y monta
// el componente de búsqueda; toda la lógica de filtrado vive en
// BusquedaCatalogo. Pasó a ser Client Component (antes no lo era) para
// poder leer `productos` del ProductosContext compartido en vez de usar
// siempre el mock fijo — así los productos que se crean en
// /formuProductos aparecen acá también, sin recargar la página.
//
// EP-02 — Los cuatro roles entran al catálogo, pero solo el Encargado de
// Inventario lo gestiona: el botón "Nuevo producto", el traslado y el ajuste
// de stock son suyos. El Vendedor consulta sin kardex (el kardex muestra
// costo); Administrador y Gerente consultan todo.
import { useState } from "react";
import Link from "next/link";
import BusquedaCatalogo from "@/components/catalogo/BusquedaCatalogo";
import { useProductos } from "@/components/catalogo/ProductosContext";
import FormularioAjuste from "@/components/inventario/FormularioAjuste";
import FormularioTraslado from "@/components/inventario/FormularioTraslado";
import { puedeGestionarCatalogo, puedeVerKardex } from "@/lib/auth/permisos";
import { useRolSesion } from "@/lib/auth/useRolSesion";
import { NOMBRE_UBICACION } from "@/lib/inventario/validaciones";
import { Modal } from "@/components/ui/Modal";
import AvisoCatalogoSinConexion from "@/components/catalogo/AvisoCatalogoSinConexion";

const formatoCantidad = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

export default function CatalogoPage() {
  const { productos, origen, actualizarUbicaciones } = useProductos();

  // El rol vive en una cookie, que en el servidor no existe: el hook lo lee en
  // el cliente sin provocar desajustes de hidratación.
  const rol = useRolSesion();
  const gestiona = puedeGestionarCatalogo(rol);
  const verKardex = puedeVerKardex(rol);

  // SCRUM-124 (Camilo) — Modal de traslado Bodega → Almacén.
  // `idTraslado` se queda con el último producto aunque el modal se cierre,
  // para que no se vacíe durante la animación de cierre. El producto se busca
  // en la lista cada vez, así el modal muestra siempre el stock al día.
  // `aperturas` cambia el key del formulario para que arranque limpio.
  const [trasladando, setTrasladando] = useState(false);
  const [idTraslado, setIdTraslado] = useState<number | null>(null);
  const [aperturas, setAperturas] = useState(0);
  const [aviso, setAviso] = useState("");
  const productoTraslado = productos.find((p) => p.id === idTraslado);

  // SCRUM-38 (Camilo) — Modal de ajuste manual de stock. Funciona igual que
  // el de traslado (mismo truco del id y de `aperturas`).
  const [ajustando, setAjustando] = useState(false);
  const [idAjuste, setIdAjuste] = useState<number | null>(null);
  const productoAjuste = productos.find((p) => p.id === idAjuste);

  const mostrarAviso = (mensaje: string) => {
    setAviso(mensaje);
    setTimeout(() => setAviso((actual) => (actual === mensaje ? "" : actual)), 6000);
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Catálogo de productos
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Busca por código o nombre, y combina los filtros de categoría,
            disponibilidad y estado.
          </p>
        </div>
        {/* Antes no había ningún link a /formuProductos en toda la app: solo
            se podía entrar escribiendo la URL a mano. Solo lo ve Inventario. */}
        {gestiona && (
          <Link
            href="/formuProductos"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Nuevo producto
          </Link>
        )}
      </div>

      {/* SCRUM-catalogoBD (Camilo) — El catálogo viene del backend. Mientras
          llega se avisa que está cargando, y si el backend no responde se
          avisa con opción de reintentar (ya no hay productos de prueba). */}
      <AvisoCatalogoSinConexion queFalta="los productos" className="mt-6" />

      {/* SCRUM-124 (Camilo) — Aviso de traslado registrado.
          SCRUM-38 (Camilo) — También se usa para el ajuste registrado. */}
      {aviso && (
        <div
          role="status"
          className="mt-6 flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
        >
          <span>{aviso}</span>
          <button onClick={() => setAviso("")} aria-label="Cerrar aviso" className="text-emerald-600">
            ✕
          </button>
        </div>
      )}

      <div className="mt-6">
        {origen === "cargando" ? (
          <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
            Cargando catálogo...
          </p>
        ) : origen === "error" ? null : (
          // (Camilo) — Con error de conexión solo se ve el aviso de arriba.
          // EP-02 — Sin la acción el componente no dibuja el botón.
          <BusquedaCatalogo
            productos={productos}
            onTrasladar={
              gestiona
                ? (producto) => {
                    setIdTraslado(producto.id);
                    setAperturas((n) => n + 1);
                    setTrasladando(true);
                  }
                : undefined
            }
            hrefKardex={
              verKardex ? (producto) => `/kardex?producto=${producto.id}` : undefined
            }
            onAjustar={
              gestiona
                ? (producto) => {
                    setIdAjuste(producto.id);
                    setAperturas((n) => n + 1);
                    setAjustando(true);
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* No se cierra con un clic afuera, para no perder lo escrito. */}
      <Modal
        isOpen={trasladando}
        onClose={() => setTrasladando(false)}
        title="Trasladar de Bodega a Almacén"
        maxWidth="lg"
        closeOnBackdropClick={false}
      >
        {productoTraslado && (
          <FormularioTraslado
            key={aperturas}
            producto={productoTraslado}
            onCancelar={() => setTrasladando(false)}
            onRegistrado={(traslado, responsable) => {
              actualizarUbicaciones(productoTraslado.id, traslado.saldoBodega, traslado.saldoAlmacen);
              setTrasladando(false);
              mostrarAviso(
                `Traslado #${traslado.idMovimiento} registrado: ${formatoCantidad.format(traslado.cantidad)} ` +
                  `de ${productoTraslado.nombre} pasaron a Almacén` +
                  (responsable ? ` (entregó ${responsable}).` : "."),
              );
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={ajustando}
        onClose={() => setAjustando(false)}
        title="Ajuste manual de stock"
        maxWidth="lg"
        closeOnBackdropClick={false}
      >
        {productoAjuste && (
          <FormularioAjuste
            key={aperturas}
            producto={productoAjuste}
            onCancelar={() => setAjustando(false)}
            onRegistrado={(ajuste) => {
              actualizarUbicaciones(productoAjuste.id, ajuste.saldoBodega, ajuste.saldoAlmacen);
              setAjustando(false);
              const signo = ajuste.tipo === "AJUSTE_POSITIVO" ? "+" : "−";
              mostrarAviso(
                `Ajuste #${ajuste.idMovimiento} registrado: ${signo}${formatoCantidad.format(ajuste.cantidad)} ` +
                  `de ${productoAjuste.nombre} en ${NOMBRE_UBICACION[ajuste.ubicacion]}.`,
              );
            }}
          />
        )}
      </Modal>
    </main>
  );
}
