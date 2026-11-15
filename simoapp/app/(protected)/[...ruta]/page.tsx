// SCRUM-154 (Camilo) — Ruta "atrapa-todo": recibe cualquier dirección que no
// coincide con ninguna página (por ejemplo /ventass o /reportes/viejo) y
// llama a notFound(). Sin este archivo, Next.js mostraría su 404 genérico
// fuera del Shell (sin Navbar ni Sidebar). Las rutas que sí existen (/ventas,
// /catalogo, /login...) tienen prioridad sobre esta, así que no las tapa.
import { notFound } from "next/navigation";

export default function RutaNoEncontrada() {
  notFound();
}
