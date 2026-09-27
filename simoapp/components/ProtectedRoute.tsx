"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Simulamos la obtención del token y el rol del localStorage
    const token = localStorage.getItem("token");
    const userRole = localStorage.getItem("role");

    // 1. Si no hay token, lo expulsa al Login
    if (!token) {
      router.replace("/login");
      return;
    }

    // 2. Si la ruta exige roles específicos y el usuario no lo tiene, lo redirige
    if (allowedRoles && (!userRole || !allowedRoles.includes(userRole))) {
      router.replace("/ventas"); // O a una página de "No Autorizado"
      return;
    }

    // 3. Si todo está bien, mostramos el contenido
    setIsAuthorized(true);
  }, [router, allowedRoles]);

  if (!isAuthorized) {
    // Mientras valida, podríamos mostrar un Loading, o devolver null
    return null;
  }

  return <>{children}</>;
}
