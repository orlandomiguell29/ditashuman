import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Protege rutas por autenticación y, opcionalmente, por rol. La verificación
// real de permisos para cada acción SIEMPRE ocurre también en el backend
// (este guard es solo UX: evita parpadeos de contenido no autorizado).
export default function ProtectedRoute({ rolesPermitidos }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <div className="loading-screen">Cargando…</div>;
  if (!usuario) return <Navigate to="/login" replace />;

  // Si el usuario todavía tiene una contraseña temporal (asignada por un
  // administrador o generada en un reset), se le obliga a cambiarla antes
  // de usar cualquier otra parte del sistema.
  if (usuario.debeCambiarPass && location.pathname !== '/cuenta/seguridad') {
    return <Navigate to="/cuenta/seguridad" replace />;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
