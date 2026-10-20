import Shell from "@/components/shell/Shell";
import { ProductosProvider } from "@/components/catalogo/ProductosContext";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductosProvider>
      <Shell>{children}</Shell>
    </ProductosProvider>
  );
}
