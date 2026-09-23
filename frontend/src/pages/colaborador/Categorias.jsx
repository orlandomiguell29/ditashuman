import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosClient';

// "Hablar con un experto" ya no es una lista estática de servicios sin
// ninguna acción (esa era la queja original): ahora es el punto de
// DESCUBRIMIENTO por tema — el colaborador elige qué le preocupa (una
// categoría real de bienestar, con sus items) y de ahí se pasa a la Agenda
// ya filtrada a los especialistas que atienden justo ese tema. Es lo que lo
// distingue de "Agendar asesoría" (acceso directo a TODOS los
// especialistas, sin pasar por este paso de "¿qué necesitas?").
export default function ColaboradorCategorias() {
  const navigate = useNavigate();
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/colaborador/categorias')
      .then((res) => setCategorias(res.data.data))
      .catch(() => setError('No fue posible cargar las categorías.'));
  }, []);

  return (
    <div>
      <h2>¿Qué te gustaría trabajar hoy?</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Elige el tema que más se ajuste a lo que necesitas y te mostramos los especialistas verificados que atienden
        justo eso, con sus horarios disponibles para agendar.
      </p>
      {error && <div className="alert-error">{error}</div>}

      <div className="categories-grid">
        {categorias.map((cat) => (
          <div
            key={cat.id}
            className="category-card"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/colaborador/agenda?categoriaId=${cat.id}&categoriaTitulo=${encodeURIComponent(cat.titulo)}`)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/colaborador/agenda?categoriaId=${cat.id}`)}
          >
            <div className="cat-header">
              <h3>{cat.titulo}</h3>
            </div>
            <ul>
              {(cat.CategoriaItems || []).map((item) => (
                <li key={item.id}>• {item.nombre}</li>
              ))}
            </ul>
            <button type="button" className="btn-xs" style={{ marginTop: 10 }}>Ver especialistas de este tema →</button>
          </div>
        ))}
        {categorias.length === 0 && !error && <p style={{ color: 'var(--text-muted)' }}>Aún no hay categorías configuradas.</p>}
      </div>
    </div>
  );
}
