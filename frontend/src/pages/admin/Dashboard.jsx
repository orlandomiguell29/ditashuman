import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';

// Página de inicio del SUPER_ADMIN: antes entraba directo a "Usuarios" (una
// tabla de gestión). Este panorama general de la plataforma va primero.
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/dashboard')
      .then((res) => setData(res.data.data))
      .catch(() => setError('No fue posible cargar los indicadores de la plataforma.'));
  }, []);

  if (error) return <div className="alert-error">{error}</div>;
  if (!data) return <p>Cargando indicadores…</p>;

  return (
    <div>
      <h2>Panorama General de la Plataforma</h2>
      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Empresas activas</h3>
          <div className="value">{data.totalEmpresas}</div>
        </div>
        <div className="kpi-card">
          <h3>Usuarios activos</h3>
          <div className="value">{data.totalUsuarios}</div>
        </div>
        <div className="kpi-card">
          <h3>Especialistas activos</h3>
          <div className="value">{data.especialistasActivos}</div>
        </div>
        <div className="kpi-card">
          <h3>Especialistas por verificar</h3>
          <div className="value" style={{ color: data.especialistasPendientes > 0 ? '#f59e0b' : undefined }}>
            {data.especialistasPendientes}
          </div>
        </div>
      </div>

      <div className="dashboard-charts-mock">
        <div className="mock-chart">
          <h3>Actividad de citas</h3>
          <p>{data.citasDelMes} citas agendadas este mes.</p>
          <p>{data.citasCompletadas} citas completadas históricamente.</p>
        </div>
        <div className="mock-chart">
          <h3>Comisiones</h3>
          <p>{data.comisionesPendientes} comisiones pendientes de liquidar.</p>
        </div>
      </div>
    </div>
  );
}
