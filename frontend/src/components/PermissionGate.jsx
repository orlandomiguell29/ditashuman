import { useAuth } from '../context/AuthContext';

// Oculta/deshabilita elementos de UI según permisos, evitando que un usuario
// vea botones de acciones que el backend rechazaría de todas formas. Es una
// capa de UX, NUNCA el control de seguridad real (ese vive en el backend).
export default function PermissionGate({ permiso, children }) {
  const { tienePermiso } = useAuth();
  if (!tienePermiso(permiso)) return null;
  return children;
}
