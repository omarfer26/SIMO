import Shell from "@/components/shell/Shell";
import { ProductosProvider } from "@/components/catalogo/ProductosContext";
import { NotificacionesProvider } from "@/components/notificaciones/NotificacionesContext";
import VigilanteStockMinimo from "@/components/notificaciones/VigilanteStockMinimo";
import ContenedorNotificaciones from "@/components/notificaciones/ContenedorNotificaciones";

// Centro de notificaciones — El provider de avisos va por dentro del de
// productos porque el VigilanteStockMinimo necesita leer el catálogo para
// detectar cuándo un producto cruza su stock mínimo. La pila de Toasts se monta
// al final: se saca del árbol con createPortal, así que su posición acá no
// afecta dónde aparece en pantalla.
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductosProvider>
      <NotificacionesProvider>
        <VigilanteStockMinimo />
        <Shell>{children}</Shell>
        <ContenedorNotificaciones />
      </NotificacionesProvider>
    </ProductosProvider>
  );
}
