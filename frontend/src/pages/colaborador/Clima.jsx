import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import Modal from '../../components/Modal';

export default function ColaboradorClima() {
  const [encuestas, setEncuestas] = useState([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [respondiendo, setRespondiendo] = useState(null); // encuesta seleccionada
  const [respuestas, setRespuestas] = useState({}); // { preguntaId: valor }
  const [enviando, setEnviando] = useState(false);

  function cargar() {
    api
      .get('/colaborador/clima/encuestas')
      .then((res) => setEncuestas(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'No fue posible cargar las encuestas.'));
  }
  useEffect(cargar, []);

  function abrir(encuesta) {
    setRespondiendo(encuesta);
    setRespuestas({});
    setError('');
  }

  async function enviar(e) {
    e.preventDefault();
    const cuerpo = Object.entries(respuestas)
      .filter(([, valor]) => String(valor).trim() !== '')
      .map(([preguntaId, valor]) => ({ preguntaId: Number(preguntaId), valor: String(valor) }));

    if (cuerpo.length !== (respondiendo.EncuestaPreguntas?.length || 0)) {
      setError('Responde todas las preguntas antes de enviar.');
      return;
    }

    setEnviando(true);
    setError('');
    try {
      await api.post(`/empresa/clima/encuestas/${respondiendo.id}/responder`, { respuestas: cuerpo });
      setRespondiendo(null);
      setMensaje(`Gracias por responder "${respondiendo.titulo}".`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible enviar tus respuestas.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h2>Encuestas de Clima Organizacional</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Tu opinión ayuda a mejorar el ambiente de trabajo. Las encuestas anónimas nunca guardan quién respondió, ni siquiera DITASH puede saberlo.
      </p>
      {error && !respondiendo && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="clima-grid">
        {encuestas.map((enc) => (
          <div key={enc.id} className="clima-card-item">
            <h4>{enc.titulo}</h4>
            <p>{enc.anonima ? '🔒 Anónima' : 'Identificada'} · Vigente hasta {enc.fecha_fin}</p>
            <p>{enc.EncuestaPreguntas?.length || 0} preguntas</p>
            <button className="btn-primary" disabled={enc.yaRespondida} onClick={() => abrir(enc)}>
              {enc.yaRespondida ? 'Ya respondida' : 'Responder'}
            </button>
          </div>
        ))}
        {encuestas.length === 0 && !error && <p>No hay encuestas activas por el momento.</p>}
      </div>

      {respondiendo && (
        <Modal titulo={respondiendo.titulo} onClose={() => setRespondiendo(null)}>
          <form onSubmit={enviar} className="form-grid">
            {error && <div className="alert-error">{error}</div>}
            {(respondiendo.EncuestaPreguntas || []).map((p) => (
              <div key={p.id} style={{ marginTop: 10 }}>
                <label>{p.texto}</label>
                {p.tipo === 'escala_1_5' && (
                  <div className="competencies-list" style={{ marginTop: 6 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="checkbox-label">
                        <input
                          type="radio"
                          name={`p${p.id}`}
                          checked={respuestas[p.id] === String(n)}
                          onChange={() => setRespuestas({ ...respuestas, [p.id]: String(n) })}
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                )}
                {p.tipo === 'si_no' && (
                  <div className="competencies-list" style={{ marginTop: 6 }}>
                    {['Si', 'No'].map((v) => (
                      <label key={v} className="checkbox-label">
                        <input type="radio" name={`p${p.id}`} checked={respuestas[p.id] === v} onChange={() => setRespuestas({ ...respuestas, [p.id]: v })} />
                        {v}
                      </label>
                    ))}
                  </div>
                )}
                {p.tipo === 'texto_libre' && (
                  <textarea value={respuestas[p.id] || ''} onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })} />
                )}
              </div>
            ))}
            <button className="btn-primary" type="submit" disabled={enviando} style={{ marginTop: 15 }}>
              {enviando ? 'Enviando…' : 'Enviar respuestas'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
