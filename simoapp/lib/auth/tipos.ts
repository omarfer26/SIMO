// SCRUM-loginMejora (Camilo) — "Moldes" de los datos de login y de creación de
// usuarios. Están copiados del contrato que hoy tiene el backend en la rama
// back-end (POST /api/auth/login y POST /api/users). Si el backend cambia un
// nombre de campo, se corrige acá y en authService.ts, no en los formularios.

// Códigos de rol tal como los guarda el backend (tabla `roles`, columna
// `codigo`). Es el mismo valor que lee middleware.ts de la cookie `role`.
export type CodigoRol = "ADMIN" | "GERENTE" | "INVENTARIO" | "VENDEDOR";

// Lo que escribe el usuario en el formulario de login.
export interface CredencialesLogin {
  correo: string;
  password: string;
}

// Lo que devuelve el login cuando sale bien.
export interface SesionIniciada {
  token: string;
  usuario: {
    id: number;
    correo: string;
    rol: CodigoRol;
  };
}

// Lo que escribe el Administrador en el formulario de "Crear usuario".
export interface DatosNuevoUsuario {
  nombreCompleto: string;
  correo: string;
  usuario: string;
  rol: CodigoRol;
  password: string;
}

// Lo que devuelve el backend al crear un usuario (nunca trae la contraseña).
export interface UsuarioCreado {
  id: number;
  nombreCompleto: string;
  correo: string;
  usuario: string;
  rol: CodigoRol;
}

// Una fila de la tabla de /usuarios. Tampoco trae la contraseña.
export interface UsuarioListado extends UsuarioCreado {
  activo: boolean;
}

// Tipos de error que la pantalla sabe explicarle al usuario. Tanto la API
// real como el mock terminan lanzando uno de estos, así los formularios no
// necesitan saber de códigos HTTP.
export type TipoErrorAuth =
  | "credenciales" // 401: correo o contraseña incorrectos
  | "cuenta_inactiva" // 403: el usuario existe pero está desactivado
  | "duplicado" // 409: correo o nombre de usuario ya registrados
  | "datos_invalidos" // 400: el backend rechazó algún campo
  | "sin_permiso" // 401/403 al crear usuario: la sesión no es de Administrador
  | "sin_conexion" // no hubo respuesta (servidor caído o sin internet)
  | "servidor"; // 500 o cualquier otra cosa inesperada

export class ErrorAuth extends Error {
  tipo: TipoErrorAuth;

  constructor(tipo: TipoErrorAuth, mensaje: string) {
    super(mensaje);
    this.name = "ErrorAuth";
    this.tipo = tipo;
  }
}
