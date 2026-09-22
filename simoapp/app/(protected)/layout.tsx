import Shell from "@/components/shell/Shell";
import { ProductosProvider } from "@/components/catalogo/ProductosContext";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <ProductosProvider>
        <Shell>{children}</Shell>
      </ProductosProvider>
    </ProtectedRoute>
  );
}
