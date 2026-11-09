// Guardia de rutas por rol. Toda la decisión vive en lib/auth/permisos.ts
// (la matriz módulo × rol); acá solo se aplica: sin sesión → /login, con
// sesión pero sin permiso → al inicio de su rol (nunca a "/", que no todos
// pueden ver).
//
// Ojo con el ciclo: si el rol no puede ver "/" y lo devolviéramos ahí, el
// middleware lo volvería a rebotar infinitas veces. Por eso cada rol tiene su
// propio inicio (INICIO_POR_ROL) y se agrega un escape por si el inicio
// coincidiera con la ruta pedida.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { esRolValido, inicioDe, puedeVerRuta } from '@/lib/auth/permisos'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const rolCrudo = request.cookies.get('role')?.value
  const rol = esRolValido(rolCrudo) ? rolCrudo : null
  const { pathname } = request.nextUrl

  // Si el usuario entra a /login o a /recuperar-password
  if (pathname.startsWith('/login') || pathname.startsWith('/recuperar-password')) {
    // Si ya está logueado, lo mandamos al inicio de su rol
    if (token && rol) {
      return NextResponse.redirect(new URL(inicioDe(rol), request.url))
    }
    return NextResponse.next()
  }

  // Para CUALQUIER otra ruta, verificamos que tenga token
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Sesión vieja sin cookie de rol válida: no hay a dónde devolverlo sin
  // arriesgar un ciclo, así que lo dejamos pasar. El backend sigue validando
  // el token y negando lo que ese usuario no pueda hacer.
  if (!rol) {
    return NextResponse.next()
  }

  const inicio = inicioDe(rol)

  // Escape anti-ciclo: el inicio del rol siempre se abre.
  if (pathname === inicio) {
    return NextResponse.next()
  }

  if (!puedeVerRuta(rol, pathname)) {
    return NextResponse.redirect(new URL(inicio, request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Configurar en qué rutas queremos que se ejecute el middleware
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
