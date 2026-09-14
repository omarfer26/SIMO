# SIMO

Sistema web para la gestión integral de inventarios, ventas y trazabilidad de pedidos en pequeñas empresas del sector retail (comercio minorista tipo San Andresito / Alejandría). Trabajo de grado — UFPS, Ingeniería de Sistemas.

## Avances por tarea (Sprint 1)

### SCRUM-31 — [Front End] Barra de búsqueda del catálogo con filtros acumulativos
**Hecho por:** Camilo Sánchez

Se implementó la búsqueda en vivo del catálogo (filtra mientras se escribe, sin botón "buscar") combinada con filtros de **categoría + disponibilidad + estado**, que se acumulan entre sí en vez de reemplazarse (RF-05 y RF-06).

Archivos nuevos, todos dentro de `simoapp/`:

| Archivo | Contenido |
|---|---|
| `components/catalogo/tipos.ts` | Tipos de TypeScript de `Producto` y de los filtros disponibles. |
| `components/catalogo/productos.mock.ts` | 12 productos de prueba (mock), usados mientras el backend no expone el endpoint real. |
| `components/catalogo/BusquedaCatalogo.tsx` | Componente principal: input de búsqueda, selects de categoría/disponibilidad/estado, botón "Limpiar filtros" y listado de resultados (con mensaje cuando no hay coincidencias). |
| `app/catalogo/page.tsx` | Página en la ruta `/catalogo` que renderiza el componente anterior. |

**Pendiente para cuando el backend esté listo:** reemplazar `productosMock` por el fetch real y confirmar los nombres de campos que entregue la API (en el mock se usa camelCase, p. ej. `precioVenta`, `stockActual`).
