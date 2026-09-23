import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import ExportButtons from '../../components/ExportButtons';

export default function EspecialistaIngresos() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/especialista/ingresos')
      .then((res) => setData(res.data.data))
      .catch(() => setError('No fue posible cargar tus ingresos.'));
  }, []);

  if (error) return <div className="alert-error">{error}</div>;
  if (!data) return <p>Cargando…</p>;

  return (
    <div>
      <h2>Gestión de Honorarios y Liquidación Quincenal</h2>

      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Tasa de Comisión DITASH</h3>
          <div className="value">{data.pctComision}%</div>
        </div>
        <div className="kpi-card">
          <h3>Total Neto Acumulado</h3>
          <div className="value">${data.totalNetoAcumulado.toLocaleString('es-CO')}</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <ExportButtons endpoint="/especialista/ingresos/export" nombreArchivo="ingresos_ditash" />
      </div>

      <table className="data-table" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th>Cita</th>
            <th>Bruto</th>
            <th>Comisión</th>
            <th>Neto</th>
            <th>Periodo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.comisiones.map((c) => (
            <tr key={c.id}>
              <td>#{c.cita_id}</td>
              <td>${Number(c.monto_bruto).toLocaleString('es-CO')}</td>
              <td>${Number(c.monto_comision).toLocaleString('es-CO')}</td>
              <td>${Number(c.monto_neto).toLocaleString('es-CO')}</td>
              <td>{c.periodo_liquidacion}</td>
              <td>{c.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
