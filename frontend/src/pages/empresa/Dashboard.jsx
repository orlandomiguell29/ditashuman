import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';

export default function EmpresaDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/empresa/dashboard')
      .then((res) => setData(res.data.data))
      .catch(() => setError('No fue posible cargar los indicadores.'));
  }, []);

  if (error) return <div className="alert-error">{error}</div>;
  if (!data) return <p>Cargando indicadores…</p>;

  return (
    <div>
      <h2>Dashboard de Recursos Humanos &amp; SST (Datos en Vivo)</h2>
      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Colaboradores</h3>
          <div className="value">{data.totalColaboradores}</div>
        </div>
        <div className="kpi-card">
          <h3>Asesorías Completadas</h3>
          <div className="value">{data.citasCompletadas}</div>
        </div>
        <div className="kpi-card">
          <h3>Progreso Promedio Cursos</h3>
          <div className="value">{data.horasCapacitacionPromedio}%</div>
        </div>
        <div className="kpi-card">
          <h3>Clima Organizacional</h3>
          <div className="value" style={{ color: '#10b981' }}>{data.climaOrganizacional}</div>
        </div>
      </div>

      <div className="dashboard-charts-mock">
        <div className="mock-chart">
          <h3>Evaluaciones de Desempeño Cerradas</h3>
          <p>{data.evaluacionesCerradas} evaluaciones completadas en el periodo actual.</p>
        </div>
        <div className="mock-chart">
          <h3>Especialistas más Solicitados</h3>
          <p>
            {data.especialistasMasSolicitados.length === 0 && 'Aún no hay suficientes datos.'}
            {data.especialistasMasSolicitados.map((e, i) => (
              <span key={i}>
                {i + 1}. {e.especialidad} ({e.totalCitas} citas)
                <br />
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
