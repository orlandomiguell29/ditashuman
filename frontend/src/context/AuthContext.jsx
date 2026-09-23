import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { setAccessToken, setCsrfToken } from '../api/axiosClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarCsrf = useCallback(async () => {
    try {
      const { data } = await api.get('/csrf-token');
      setCsrfToken(data.csrfToken);
    } catch {
      // Si no hay token CSRF disponible, las mutaciones fallarán con 403 y
      // el usuario verá un mensaje claro; no bloqueamos la carga de la app.
    }
  }, []);

  // Al montar la app, se intenta restaurar la sesión desde la cookie httpOnly
  // del refresh token (el access token nunca persiste entre recargas).
  useEffect(() => {
    (async () => {
      await cargarCsrf();
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        setUsuario(data.usuario);
      } catch {
        setUsuario(null);
      } finally {
        setCargando(false);
      }
    })();
  }, [cargarCsrf]);

  useEffect(() => {
    const handler = () => setUsuario(null);
    window.addEventListener('ditash:sesion-expirada', handler);
    return () => window.removeEventListener('ditash:sesion-expirada', handler);
  }, []);

  // Si la cuenta tiene MFA habilitado, el backend no entrega sesión todavía:
  // devuelve un reto de 5 minutos y el llamador (Login.jsx) debe pedir el
  // código de 6 dígitos y llamar a `completarMfa`. `usuario` sigue null
  // hasta que el segundo factor se valida.
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.mfaRequerido) return { mfaRequerido: true, mfaChallengeToken: data.mfaChallengeToken };
    setAccessToken(data.accessToken);
    setUsuario(data.usuario);
    return { mfaRequerido: false, usuario: data.usuario };
  }, []);

  const completarMfa = useCallback(async (mfaChallengeToken, codigo) => {
    const { data } = await api.post('/auth/login/mfa', { mfaChallengeToken, codigo });
    setAccessToken(data.accessToken);
    setUsuario(data.usuario);
    return data.usuario;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUsuario(null);
    }
  }, []);

  const tienePermiso = useCallback(
    (codigo) => !!usuario && (usuario.rol === 'SUPER_ADMIN' || usuario.permisos?.includes(codigo)),
    [usuario]
  );

  // Permite a la pantalla de Seguridad reflejar de inmediato el nuevo
  // estado del usuario (ej. `debeCambiarPass` pasa a false) sin forzar un
  // refresh completo de sesión.
  const actualizarUsuario = useCallback((cambios) => {
    setUsuario((actual) => (actual ? { ...actual, ...cambios } : actual));
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, completarMfa, logout, tienePermiso, actualizarUsuario }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
