// Matriz de acceso por rol — Única fuente de verdad de a qué módulo entra cada
// rol y qué puede hacer adentro. La usan tres lugares, y ninguno decide por su
// cuenta:
//   - middleware.ts: bloquea la ruta y manda al inicio del rol.
//   - components/shell/Sidebar.tsx: esconde los módulos que no le tocan, para
//     que el menú no ofrezca puertas que el middleware va a cerrar.
//   - Cada página: esconde las acciones (botones, pestañas, columnas) que el
//     backend le negaría a ese rol. Un 403 en apiClient.ts cierra la sesión,
//     así que ofrecer una acción prohibida expulsa al usuario.
//
// Quien da el permiso de verdad sigue siendo el token en el backend
// (verificarRol en backend/src/routes). Esto solo evita el viaje en vano.
//
// Matriz aprobada (módulo × rol):
//   EP-01 Usuarios y Administración: ADMIN total, el resto sin acceso.
//   EP-02 Catálogo e Inventario: INVENTARIO gestiona; ADMIN lee; GERENTE lee
//         con costo; VENDEDOR lee sin costo ni kardex.
//   EP-03 Ventas POS: VENDEDOR opera; ADMIN y GERENTE solo anulan; INVENTARIO
//         sin acceso.
//   EP-04 Pedidos: VENDEDOR opera todo; INVENTARIO alista (pasa a preparación
//         y marca listo); ADMIN y GERENTE solo leen.
//   EP-05 Dashboard: ADMIN y GERENTE; INVENTARIO y VENDEDOR sin acceso.
//   EP-05 Alertas y Auditoría: ADMIN y GERENTE todo; INVENTARIO solo las
//         alertas de stock; VENDEDOR sin acceso.

import type { EstadoPedido } from "@/lib/pedidos/tipos";
import type { CodigoRol } from "./tipos";

// Los cuatro códigos de la tabla `roles`. Es la lista que valida la cookie
// `role` y la que usan las reglas de abajo.
export const ROLES: readonly CodigoRol[] = [
  "ADMIN",
  "GERENTE",
  "INVENTARIO",
  "VENDEDOR",
];

export function esRolValido(valor: string | null | undefined): valor is CodigoRol {
  return (
    valor === "ADMIN" ||
    valor === "GERENTE" ||
    valor === "INVENTARIO" ||
    valor === "VENDEDOR"
  );
}

// Cómo se muestra cada rol en pantalla (Navbar, modales de autorización).
export const NOMBRE_ROL: Record<CodigoRol, string> = {
  ADMIN: "Administrador",
  GERENTE: "Propietario / Gerente",
  INVENTARIO: "Encargado de Inventario",
  VENDEDOR: "Vendedor",
};

// A dónde cae cada rol cuando entra a "/" o cuando el middleware le bloquea
// una ruta. Si lo devolviéramos siempre a "/", el Inventario y el Vendedor
// quedarían rebotando (no tienen Dashboard) en un ciclo infinito.
export const INICIO_POR_ROL: Record<CodigoRol, string> = {
  ADMIN: "/",
  GERENTE: "/",
  INVENTARIO: "/catalogo",
  VENDEDOR: "/ventas",
};

export function inicioDe(rol: CodigoRol | null): string {
  return rol ? INICIO_POR_ROL[rol] : "/login";
}

interface ReglaRuta {
  prefijo: string;
  roles: readonly CodigoRol[];
}

// Ordenadas de la más específica a la más general; gana siempre el prefijo
// más largo que coincida (así "/formuProductos" no depende del orden de la
// lista). "/" es exacta: si no, se comería todas las rutas.
const TODOS: readonly CodigoRol[] = ROLES;

const REGLAS: readonly ReglaRuta[] = [
  { prefijo: "/usuarios", roles: ["ADMIN"] },
  { prefijo: "/admin", roles: ["ADMIN"] },
  { prefijo: "/formuProductos", roles: ["INVENTARIO"] },
  // SCRUM-57 — El kardex muestra costo y movimientos: el Vendedor no lo ve.
  { prefijo: "/kardex", roles: ["ADMIN", "GERENTE", "INVENTARIO"] },
  // HU-15 — Auditoría y reportes: el Inventario solo entra por las alertas de
  // stock (la pestaña); las otras pestañas las filtra la propia página.
  { prefijo: "/alertas", roles: ["ADMIN", "GERENTE", "INVENTARIO"] },
  { prefijo: "/catalogo", roles: TODOS },
  // EP-03 — Sin el Inventario: el POS no es su módulo.
  { prefijo: "/ventas", roles: ["ADMIN", "GERENTE", "VENDEDOR"] },
  { prefijo: "/pedidos", roles: TODOS },
  // EP-05 — Dashboard: exclusivo del Administrador y del Gerente.
  { prefijo: "/", roles: ["ADMIN", "GERENTE"] },
];

function reglaDeRuta(pathname: string): ReglaRuta | undefined {
  let encontrada: ReglaRuta | undefined;

  for (const regla of REGLAS) {
    const coincide =
      regla.prefijo === "/"
        ? pathname === "/"
        : pathname === regla.prefijo || pathname.startsWith(`${regla.prefijo}/`);

    if (coincide && (!encontrada || regla.prefijo.length > encontrada.prefijo.length)) {
      encontrada = regla;
    }
  }

  return encontrada;
}

// ¿Este rol puede abrir esta ruta? Sin rol (sin sesión) no puede nada. Las
// rutas que no están en la matriz (p. ej. /componentes) quedan abiertas a
// cualquier sesión: la matriz solo cierra lo que dice que hay que cerrar.
export function puedeVerRuta(rol: CodigoRol | null, pathname: string): boolean {
  if (!rol) return false;
  const regla = reglaDeRuta(pathname);
  if (!regla) return true;
  return regla.roles.includes(rol);
}

// EP-01 — Usuarios y Administración.
export function puedeAdministrarUsuarios(rol: CodigoRol | null): boolean {
  return rol === "ADMIN";
}

// EP-02 — Catálogo e Inventario. Solo el Encargado de Inventario crea,
// edita, traslada y ajusta productos.
export function puedeGestionarCatalogo(rol: CodigoRol | null): boolean {
  return rol === "INVENTARIO";
}

// EP-02 — El costo es información sensible: el Vendedor no lo ve en ninguna
// pantalla (catálogo, formulario ni kardex).
export function puedeVerCosto(rol: CodigoRol | null): boolean {
  return rol !== null && rol !== "VENDEDOR";
}

export function puedeVerKardex(rol: CodigoRol | null): boolean {
  return puedeVerRuta(rol, "/kardex");
}

// EP-03 — Ventas POS. El Vendedor es el único que registra ventas; el
// Administrador y el Gerente solo consultan el historial y autorizan
// anulaciones (que además piden credenciales gerenciales propias).
export function puedeOperarPOS(rol: CodigoRol | null): boolean {
  return rol === "VENDEDOR";
}

export function puedeAutorizarAnulacion(rol: CodigoRol | null): boolean {
  return rol === "ADMIN" || rol === "GERENTE";
}

export function puedeVerHistorialVentas(rol: CodigoRol | null): boolean {
  return puedeVerRuta(rol, "/ventas");
}

// EP-04 — Pedidos. El Vendedor registra pedidos, los mueve por todo el ciclo,
// los cancela y convierte los entregados en venta.
export function puedeRegistrarPedido(rol: CodigoRol | null): boolean {
  return rol === "VENDEDOR";
}

export function puedeConvertirPedido(rol: CodigoRol | null): boolean {
  return rol === "VENDEDOR";
}

export function puedeCancelarPedido(rol: CodigoRol | null): boolean {
  return rol === "VENDEDOR";
}

// Estados a los que cada rol puede mover un pedido. El Inventario alista:
// arranca la preparación y marca listo; el Administrador y el Gerente solo
// miran. La cancelación se pregunta aparte con puedeCancelarPedido().
const ALISTAMIENTO: readonly EstadoPedido[] = ["EN_PREPARACION", "LISTO"];

const OPERACION_COMPLETA: readonly EstadoPedido[] = [
  "CONFIRMADO",
  "EN_PREPARACION",
  "LISTO",
  "ENTREGADO",
];

export function estadosPermitidosPedido(rol: CodigoRol | null): readonly EstadoPedido[] {
  if (rol === "VENDEDOR") return OPERACION_COMPLETA;
  if (rol === "INVENTARIO") return ALISTAMIENTO;
  return [];
}

export function puedeMoverPedido(rol: CodigoRol | null): boolean {
  return estadosPermitidosPedido(rol).length > 0;
}

// EP-05 — Dashboard: exclusivo del Administrador y del Gerente.
export function puedeVerDashboard(rol: CodigoRol | null): boolean {
  return puedeVerRuta(rol, "/");
}

// EP-05 — Alertas de stock: el Inventario entra solo por acá (es su aviso de
// reposición del almacén).
export function puedeVerAlertasStock(rol: CodigoRol | null): boolean {
  return puedeVerRuta(rol, "/alertas");
}

// EP-05 — Log de auditoría y consola de reportes: solo Administrador y
// Gerente. El Inventario los ve bloqueados dentro de /alertas.
export function puedeVerAuditoria(rol: CodigoRol | null): boolean {
  return rol === "ADMIN" || rol === "GERENTE";
}
