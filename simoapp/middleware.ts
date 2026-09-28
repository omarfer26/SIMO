import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Múltiples rutas que queremos proteger
const protectedRoutes = [
  '/catalogo', 
  '/admin', 
  '/pedidos', 
  '/ventas', 
  '/usuarios', 
  '/formuProductos', 
  '/componentes'
]

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const { pathname } = request.nextUrl

  // Verificar si la ruta actual empieza con alguna de las protegidas
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute && !token) {
    // Si la ruta es protegida y no hay token, redirigir al login
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Si está en la página de login pero ya tiene token, lo enviamos al catálogo
  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/catalogo', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Configurar en qué rutas queremos que se ejecute el middleware
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
