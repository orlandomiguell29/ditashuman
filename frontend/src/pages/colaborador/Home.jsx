import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosClient';

export default function ColaboradorHome() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/colaborador/home')
      .then((res) => setData(res.data.data))
      .catch(() => setError('No fue posible cargar tu información.'));
  }, []);

  return (
    <div className="welcome-box">
      <h2>¿Qué quieres hacer hoy?</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="grid-welcome">
        {/* "Agendar asesoría" es el camino rápido: ya sabes que quieres una
            cita, ves de una vez la lista completa de especialistas y sus
            horarios. */}
        <div className="card-action" onClick={() => navigate('/colaborador/agenda')}>
          <h3>Agendar asesoría</h3>
        </div>
        <div className="card-action" onClick={() => navigate('/colaborador/academia')}>
          <h3>Ver cursos</h3>
        </div>
        {/* "Hablar con un experto" es el camino de descubrimiento: primero
            eliges QUÉ te preocupa (categorías de bienestar reales, no una
            lista estática) y de ahí se filtran los especialistas que
            atienden justo ese tema — ya no es el mismo destino que
            "Agendar asesoría". */}
        <div className="card-action" onClick={() => navigate('/colaborador/categorias')}>
          <h3>Hablar con un experto</h3>
        </div>
        {/* "Mi progreso" es tu avance (cursos, evaluaciones, asesorías,
            objetivos) — distinto de "Mi Expediente", que es tu carpeta de
            documentos y certificados. */}
        <div className="card-action" onClick={() => navigate('/colaborador/progreso')}>
          <h3>Mi progreso</h3>
        </div>
      </div>

      {data?.proximaCita && (
        <div className="pid-box" style={{ marginTop: 30 }}>
          <h3>Tu próxima cita</h3>
          <p>{new Date(data.proximaCita.fecha_hora).toLocaleString('es-CO')}</p>
        </div>
      )}

      {data?.okrs?.length > 0 && (
        <div className="exp-section" style={{ marginTop: 30 }}>
          <h3>Objetivos activos del periodo</h3>
          <ul>
            {data.okrs.map((o) => (
              <li key={o.id}>{o.descripcion} — {o.progreso_pct}%</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
