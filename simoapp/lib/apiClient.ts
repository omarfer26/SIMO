import axios from 'axios';
import { cerrarSesion, leerToken } from './auth/sesion';

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
    // SCRUM-loginMejora (Camilo) — El token se lee de la cookie (ahí lo guarda el
    // login), no de localStorage, donde nunca estuvo.
    if (typeof window !== 'undefined') {
      const token = leerToken();
      // Si el token existe, lo adjuntamos en el header Authorization
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    // Manejo de errores antes de que se envíe la solicitud
    return Promise.reject(error);
  }
);

// Interceptor de respuestas (Response Interceptor) para manejar errores globales de autenticación
apiClient.interceptors.response.use(
  (response) => {
    // Si la respuesta es exitosa, la devolvemos tal cual
    return response;
  },
  (error) => {
    // Si la respuesta tiene un código 401 (No autorizado) o 403 (Prohibido)
    // SCRUM-loginMejora (Camilo) — Se excluye el propio login: ahí un 401/403 significa
    // "credenciales incorrectas" o "cuenta inactiva", y recargar la página
    // borraba el mensaje de error antes de que el usuario pudiera leerlo.
    const esLogin = error.config?.url?.includes('/auth/login');
    // (Camilo, 2026-11-10) — Lo mismo con la anulación de ventas: ahí un
    // 401/403 es de las credenciales del Gerente que autoriza (contraseña
    // mala o rol sin permiso), no de la sesión del Vendedor que la pide.
    const esAnulacion = /\/sales\/\d+\/cancel$/.test(error.config?.url ?? '');
    if (!esLogin && !esAnulacion && error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (typeof window !== 'undefined') {
        // Limpiamos la sesión
        cerrarSesion();
        
        // Redirigimos al usuario al login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
