import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const role = request.cookies.get('role')?.value
  const { pathname } = request.nextUrl

  // Si el usuario entra a /login o a /recuperar-password
  if (pathname.startsWith('/login') || pathname.startsWith('/recuperar-password')) {
    // Si ya está logueado, lo sacamos y lo mandamos al inicio
    if (token) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Para CUALQUIER otra ruta, verificamos que tenga token
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Protección de roles: Solo admin puede ver /usuarios
  if (pathname.startsWith('/usuarios') && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // HU-15: el log de auditoría inalterable y los reportes son para el
  // Administrador y el Gerente; a los demás roles los devolvemos al inicio.
  if (pathname.startsWith('/alertas') && role !== 'ADMIN' && role !== 'GERENTE') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Configurar en qué rutas queremos que se ejecute el middleware
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
