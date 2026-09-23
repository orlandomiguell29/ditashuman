import axios from 'axios';

// El access token JWT vive SOLO en memoria (nunca en localStorage/sessionStorage):
// así un XSS no puede robarlo leyendo el storage del navegador. Se pierde al
// refrescar la página, pero se recupera automáticamente vía /auth/refresh
// (cookie httpOnly) al montar la app — ver AuthContext.
let accessToken = null;
let csrfToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setCsrfToken(token) {
  csrfToken = token;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // envía la cookie httpOnly del refresh token
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (csrfToken && config.method !== 'get') config.headers['x-csrf-token'] = csrfToken;
  return config;
});

let refreshPromise = null;
let csrfPromise = null;

// Si el access token expira (401), se intenta refrescar UNA sola vez usando
// la cookie httpOnly, y se reintenta la petición original. Si el refresh
// también falla, se propaga el error para que la UI redirija a /login.
//
// Si el token CSRF es rechazado (403 `EBADCSRFTOKEN`), se pide uno nuevo y se
// reintenta UNA sola vez. Esto cubre el caso en que la carga inicial de
// `/csrf-token` falló silenciosamente (ej. el backend todavía no había
// terminado de arrancar cuando el frontend hizo la primera petición): sin
// este reintento, el token quedaba en null para el resto de la sesión y
// CUALQUIER acción que mutara datos fallaba, aunque el login siguiera
// funcionando (está exento de CSRF).
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry && original.url !== '/auth/refresh') {
      original._retry = true;
      try {
        refreshPromise = refreshPromise || api.post('/auth/refresh');
        const { data } = await refreshPromise;
        refreshPromise = null;
        setAccessToken(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('ditash:sesion-expirada'));
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 403 && !original._csrfRetry && original.url !== '/csrf-token') {
      original._csrfRetry = true;
      try {
        csrfPromise = csrfPromise || api.get('/csrf-token');
        const { data } = await csrfPromise;
        csrfPromise = null;
        setCsrfToken(data.csrfToken);
        original.headers['x-csrf-token'] = data.csrfToken;
        return api(original);
      } catch {
        csrfPromise = null;
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
