import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosClient';

// "Mi progreso" es tu tablero de AVANCE (qué tanto has avanzado en cursos,
// evaluaciones, asesorías y objetivos) — a propósito distinto de "Mi
// Expediente" (documentos, certificados descargables, historial). Antes
// ambos enlaces del Home llevaban al mismo sitio; este es el que faltaba.
export default function ColaboradorProgreso() {
  const navigate = useNavigate();
  const [academia, setAcademia] = useState(null);
  const [expediente, setExpediente] = useState(null);
  const [proximaCita, setProximaCita] = useState(null);
  const [error, setError] = useState('');

  // Evaluaciones de desempeño tipo cuestionario asignadas (sí/no, numérica,
  // texto libre). La nota SOLO llega del backend cuando la evaluación ya
  // está 'cerrada' — mientras haya texto libre sin calificar, ni siquiera
  // se recibe el campo, así que no hay forma de "verla antes de tiempo".
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [evalError, setEvalError] = useState('');
  const [evalMensaje, setEvalMensaje] = useState('');
  const [respuestasForm, setRespuestasForm] = useState({}); // { evaluacionId: { preguntaId: valor } }
  const [enviandoEval, setEnviandoEval] = useState(null); // evaluacionId en curso

  function cargarEvaluaciones() {
    api
      .get('/colaborador/evaluaciones')
      .then((res) => setEvaluaciones(res.data.data))
      .catch(() => setEvalError('No fue posible cargar tus evaluaciones de desempeño.'));
  }

  useEffect(() => {
    Promise.all([
      api.get('/colaborador/academia'),
      api.get('/colaborador/expediente'),
      api.get('/colaborador/home'),
    ])
      .then(([acad, exp, home]) => {
        setAcademia(acad.data.data);
        setExpediente(exp.data.data);
        setProximaCita(home.data.data?.proximaCita || null);
      })
      .catch(() => setError('No fue posible cargar tu progreso.'));
    cargarEvaluaciones();
  }, []);

  function actualizarRespuesta(evaluacionId, preguntaId, campo, valor) {
    setRespuestasForm((actual) => ({
      ...actual,
      [evaluacionId]: { ...(actual[evaluacionId] || {}), [preguntaId]: { ...(actual[evaluacionId]?.[preguntaId] || {}), [campo]: valor } },
    }));
  }

  async function enviarRespuestas(evaluacion) {
    setEvalError('');
    setEvalMensaje('');
    const respuestasEval = respuestasForm[evaluacion.id] || {};
    // Sin valor por defecto en sí/no: si el colaborador no marcó nada, se
    // detecta como falta explícita en vez de mandar "No" en silencio.
    const faltaAlguna = evaluacion.preguntas.some((p) => {
      const r = respuestasEval[p.id] || {};
      if (p.tipo === 'si_no') return typeof r.valorSiNo !== 'boolean';
      if (p.tipo === 'numerica') return r.valorNumerico === undefined || r.valorNumerico === '' || Number.isNaN(Number(r.valorNumerico));
      return !r.valorTexto || !r.valorTexto.trim();
    });
    if (faltaAlguna) {
      setEvalError('Responde todas las preguntas antes de enviar.');
      return;
    }
    const respuestas = evaluacion.preguntas.map((p) => {
      const r = respuestasEval[p.id] || {};
      if (p.tipo === 'si_no') return { preguntaId: p.id, valorSiNo: r.valorSiNo };
      if (p.tipo === 'numerica') return { preguntaId: p.id, valorNumerico: Number(r.valorNumerico) };
      return { preguntaId: p.id, valorTexto: r.valorTexto.trim() };
    });
    setEnviandoEval(evaluacion.id);
    try {
      const { data } = await api.post(`/colaborador/evaluaciones/${evaluacion.id}/responder`, { respuestas });
      setEvalMensaje(data.mensaje);
      cargarEvaluaciones();
    } catch (err) {
      setEvalError(err.response?.data?.error || 'No fue posible enviar tus respuestas.');
    } finally {
      setEnviandoEval(null);
    }
  }

  if (error) return <div className="alert-error">{error}</div>;
  if (!academia || !expediente) return <p>Cargando tu progreso…</p>;

  const inscripciones = academia.inscripciones || [];
  const completados = inscripciones.filter((i) => i.estado === 'completado');
  const enProgreso = inscripciones.filter((i) => i.estado !== 'completado');
  const cursosPorId = new Map((academia.cursos || []).map((c) => [c.id, c]));
  const progresoPromedio = inscripciones.length
    ? Math.round(inscripciones.reduce((sum, i) => sum + (i.progreso_pct || 0), 0) / inscripciones.length)
    : 0;

  const asesoriasCompletadas = (expediente.historialAsesorias || []).length;
  const okrs = expediente.okrs || [];
  const okrPromedio = okrs.length ? Math.round(okrs.reduce((sum, o) => sum + (o.progreso_pct || 0), 0) / okrs.length) : null;

  return (
    <div>
      <h2>Mi Progreso</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Tu avance general en cursos, evaluaciones, asesorías y objetivos. Para descargar certificados o documentos, ve a{' '}
        <button type="button" className="btn-link" onClick={() => navigate('/colaborador/expediente')}>Mi Expediente</button>.
      </p>

      <div className="grid-welcome" style={{ marginTop: 20 }}>
        <div className="pid-box">
          <h3 style={{ marginTop: 0 }}>{completados.length}/{inscripciones.length || 0}</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Cursos completados</p>
        </div>
        <div className="pid-box">
          <h3 style={{ marginTop: 0 }}>{progresoPromedio}%</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Avance promedio de aprendizaje</p>
        </div>
        <div className="pid-box">
          <h3 style={{ marginTop: 0 }}>{asesoriasCompletadas}</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Asesorías completadas</p>
        </div>
        <div className="pid-box">
          <h3 style={{ marginTop: 0 }}>{okrPromedio === null ? '—' : `${okrPromedio}%`}</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Avance de objetivos del periodo</p>
        </div>
      </div>

      {proximaCita && (
        <div className="exp-section" style={{ marginTop: 24 }}>
          <h3>Tu próxima cita</h3>
          <p>{new Date(proximaCita.fecha_hora).toLocaleString('es-CO')}</p>
        </div>
      )}

      <div className="exp-section" style={{ marginTop: 24 }}>
        <h3>Cursos en progreso</h3>
        <ul className="simple-list">
          {enProgreso.map((i) => {
            const curso = cursosPorId.get(i.curso_id);
            return (
              <li key={i.id} style={{ display: 'block', padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span>{curso?.titulo || 'Curso'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {i.progreso_pct}% de videos
                    {i.quiz_intentos > 0 && ` · evaluación: ${i.quiz_aprobado ? 'aprobada' : `mejor intento ${i.quiz_mejor_puntaje}%`}`}
                  </span>
                </div>
                <div className="progreso-barra" style={{ marginTop: 6 }}>
                  <div className="progreso-relleno" style={{ width: `${i.progreso_pct}%` }} />
                </div>
              </li>
            );
          })}
          {enProgreso.length === 0 && <li style={{ color: 'var(--text-muted)' }}>No tienes cursos en progreso.</li>}
        </ul>
        <button type="button" className="btn-xs" style={{ marginTop: 10 }} onClick={() => navigate('/colaborador/academia')}>
          Ir a Academia →
        </button>
      </div>

      <div className="exp-section" style={{ marginTop: 24 }}>
        <h3>Objetivos del Periodo (OKRs)</h3>
        <ul className="simple-list">
          {okrs.map((o) => (
            <li key={o.id} style={{ display: 'block', padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>{o.descripcion}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.progreso_pct}%</span>
              </div>
              <div className="progreso-barra" style={{ marginTop: 6 }}>
                <div className="progreso-relleno" style={{ width: `${o.progreso_pct}%` }} />
              </div>
            </li>
          ))}
          {okrs.length === 0 && <li style={{ color: 'var(--text-muted)' }}>RRHH aún no ha definido objetivos para este periodo.</li>}
        </ul>
      </div>

      {evaluaciones.length > 0 && (
        <div className="exp-section" style={{ marginTop: 24 }}>
          <h3>Evaluaciones de desempeño</h3>
          {evalError && <div className="alert-error">{evalError}</div>}
          {evalMensaje && <div className="alert-success">{evalMensaje}</div>}
          <ul className="simple-list">
            {evaluaciones.map((ev) => (
              <li key={ev.id} style={{ display: 'block', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span><strong>{ev.TipoEvaluacion?.nombre}</strong> — periodo {ev.periodo}</span>
                  {ev.estado === 'cerrada' && (
                    <span className="tag">Nota: {Number(ev.notaFinal ?? 0).toFixed(1)} / {ev.puntosTotales.toFixed(1)}</span>
                  )}
                  {ev.estado === 'en_progreso' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Esperando calificación del evaluador…</span>}
                  {ev.estado === 'abierta' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendiente de responder</span>}
                </div>

                {/* En_progreso/cerrada: ya respondió, no hay formulario que mostrar. */}
                {ev.estado === 'abierta' && !ev.respondida && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ev.preguntas.map((p) => {
                      const valor = respuestasForm[ev.id]?.[p.id] || {};
                      return (
                        <div key={p.id} style={{ border: '1px solid var(--gray-border)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{p.texto}</p>
                          {p.tipo === 'si_no' && (
                            <div className="inline-form" style={{ marginTop: 8 }}>
                              <label className="checkbox-label">
                                <input
                                  type="radio"
                                  name={`p-${p.id}`}
                                  checked={valor.valorSiNo === true}
                                  onChange={() => actualizarRespuesta(ev.id, p.id, 'valorSiNo', true)}
                                />
                                Sí
                              </label>
                              <label className="checkbox-label">
                                <input
                                  type="radio"
                                  name={`p-${p.id}`}
                                  checked={valor.valorSiNo === false}
                                  onChange={() => actualizarRespuesta(ev.id, p.id, 'valorSiNo', false)}
                                />
                                No
                              </label>
                            </div>
                          )}
                          {p.tipo === 'numerica' && (
                            <input
                              type="number"
                              step="any"
                              style={{ marginTop: 8, maxWidth: 160 }}
                              value={valor.valorNumerico ?? ''}
                              onChange={(e) => actualizarRespuesta(ev.id, p.id, 'valorNumerico', e.target.value)}
                            />
                          )}
                          {p.tipo === 'texto_libre' && (
                            <textarea
                              style={{ marginTop: 8 }}
                              value={valor.valorTexto || ''}
                              onChange={(e) => actualizarRespuesta(ev.id, p.id, 'valorTexto', e.target.value)}
                              placeholder="Escribe tu respuesta…"
                            />
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: 'auto' }}
                      disabled={enviandoEval === ev.id}
                      onClick={() => enviarRespuestas(ev)}
                    >
                      {enviandoEval === ev.id ? 'Enviando…' : 'Enviar respuestas'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
