import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import ExportButtons from '../../components/ExportButtons';
import { useAuth } from '../../context/AuthContext';

// Los permisos son un catálogo de solo lectura (generado por el backend a
// partir de src/config/permisos.js). Aquí se listan y exportan, pero no se
// editan libremente: cada código de permiso debe corresponder exactamente
// a un `requirePermission(...)` real en las rutas del backend.
export default function AdminPermisos() {
  const { tienePermiso } = useAuth();
  const [permisos, setPermisos] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/permisos').then((res) => setPermisos(res.data.data)).catch(() => setError('No fue posible cargar los permisos.'));
  }, []);

  const columns = [
    { key: 'codigo', header: 'Código' },
    { key: 'modulo', header: 'Módulo' },
    { key: 'accion', header: 'Acción' },
  ];

  return (
    <div>
      <h2>Catálogo de Permisos</h2>
      {error && <div className="alert-error">{error}</div>}
      <div className="toolbar">
        <ExportButtons endpoint="/permisos/export" nombreArchivo="permisos_ditash" disabled={!tienePermiso('permisos.exportar')} />
      </div>
      <DataTable claveGuardado="admin-permisos" columns={columns} rows={permisos} />
    </div>
  );
}
