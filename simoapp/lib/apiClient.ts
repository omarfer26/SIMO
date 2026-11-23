import axios, { type InternalAxiosRequestConfig } from 'axios';
import { cerrarSesion, leerToken } from './auth/sesion';
import { notificarSesionExpirada, suscribirSesionRecuperada } from './auth/gestorExpiracion';

// Cola de peticiones pendientes mientras el usuario se re-autentica en el modal
let reintentosPendientes: Array<(token: string) => void> = [];

if (typeof window !== 'undefined') {
  suscribirSesionRecuperada(() => {
    const nuevoToken = leerToken();
    if (nuevoToken) {
      reintentosPendientes.forEach((cb) => cb(nuevoToken));
    }
    reintentosPendientes = [];
  });
}

// baseURL apuntará al backend o a un host de desarrollo
// Si no hay variable de entorno, por defecto usa http://localhost:3001/api
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor de solicitudes (Request Interceptor) para adjuntar el JWT token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = leerToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor de respuestas para manejar expiración pasiva de sesión (401)
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const configOriginal = error.config as InternalAxiosRequestConfig & { _reintentado?: boolean };
    const esLogin = configOriginal?.url?.includes('/auth/login');

    // 401 indica token expirado o inválido (excluyendo el propio endpoint de login)
    if (!esLogin && error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        // Notificar al modal de expiración pasiva sin destruir la pantalla actual
        notificarSesionExpirada();

        // Encolar la petición fallida para reintentarla apenas el usuario reingrese contraseña
        if (!configOriginal._reintentado) {
          configOriginal._reintentado = true;
          return new Promise((resolve, reject) => {
            reintentosPendientes.push((nuevoToken) => {
              if (configOriginal.headers) {
                configOriginal.headers.Authorization = `Bearer ${nuevoToken}`;
              }
              resolve(apiClient(configOriginal));
            });
          });
        }
      }
    }

    // 403: Prohibido por rol insuficiente
    if (!esLogin && error.response && error.response.status === 403) {
      if (typeof window !== 'undefined') {
        cerrarSesion();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
