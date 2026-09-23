import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';

// Página de inicio del especialista: antes entraba directo a "Agenda" (una
// lista de acción). Este resumen da el vistazo general antes de trabajar.
export default function EspecialistaDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/especialista/dashboard')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'No fue posible cargar tu panorama.'));
  }, []);

  if (error) return <div className="alert-error">{error}</div>;
  if (!data) return <p>Cargando panorama…</p>;

  return (
    <div>
      <h2>Mi Panorama</h2>
      {!data.especialista.verificado && (
        <div className="alert-error" style={{ marginBottom: 15 }}>
          Tu perfil todavía no ha sido verificado por el equipo DITASH. Algunas funciones pueden estar limitadas hasta entonces.
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Citas completadas</h3>
          <div className="value">{data.totalCitasCompletadas}</div>
        </div>
        <div className="kpi-card">
          <h3>Ingresos netos del mes</h3>
          <div className="value">${data.netoDelMes.toLocaleString('es-CO')}</div>
        </div>
        <div className="kpi-card">
          <h3>Ingresos netos acumulados</h3>
          <div className="value">${data.totalNetoAcumulado.toLocaleString('es-CO')}</div>
        </div>
        <div className="kpi-card">
          <h3>Estado del perfil</h3>
          <div className="value" style={{ color: data.especialista.activo ? '#10b981' : '#ef4444' }}>
            {data.especialista.activo ? 'Activo' : 'Inactivo'}
          </div>
        </div>
      </div>

      <div className="dashboard-charts-mock">
        <div className="mock-chart">
          <h3>Próximas citas</h3>
          {data.proximasCitas.length === 0 && <p>No tienes citas próximas agendadas.</p>}
          {data.proximasCitas.map((c) => (
            <p key={c.id}>
              {new Date(c.fecha_hora).toLocaleString('es-CO')} — {c.Colaborador?.Usuario?.nombre} ({c.motivo})
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
