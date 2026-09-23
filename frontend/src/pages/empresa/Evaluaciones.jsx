import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import Modal from '../../components/Modal';
import PermissionGate from '../../components/PermissionGate';
import EstadoBadge from '../../components/EstadoBadge';
import { IconPlus, IconTrash, IconClipboardList } from '../../components/icons';

const ETIQUETAS_PID = { sugerido: 'Sugerido', en_progreso: 'En progreso', completado: 'Completado' };
const VARIANTE_PID = { sugerido: 'neutro', en_progreso: 'alerta', completado: 'exito' };

// Estado de la evaluación tipo cuestionario (ver EvaluacionPregunta en el
// backend): 'abierta' = el colaborador no ha respondido todavía;
// 'en_progreso' = ya respondió pero falta calificar texto libre a mano (la
// nota no es visible para él mientras tanto); 'cerrada' = calificación
// completa y nota visible.
const ETIQUETAS_ESTADO_EVAL = { abierta: 'Pendiente de respuesta', en_progreso: 'Esperando calificación', cerrada: 'Calificada' };
const VARIANTE_ESTADO_EVAL = { abierta: 'neutro', en_progreso: 'alerta', cerrada: 'exito' };
const ETIQUETAS_TIPO_PREGUNTA = { si_no: 'Sí / No', numerica: 'Numérica', texto_libre: 'Texto libre' };

const PREGUNTA_VACIA = { tipo: 'si_no', texto: '', puntos: 1, respuestaCorrectaSiNo: true, respuestaCorrectaNumerica: 0 };

export default function EmpresaEvaluaciones() {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [tiposEvaluacion, setTiposEvaluacion] = useState([]);
  const [competencias, setCompetencias] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [colaboradorId, setColaboradorId] = useState('');
  const [tipoEvaluacionId, setTipoEvaluacionId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [puntajes, setPuntajes] = useState({}); // { competenciaId: puntaje (0 = no evaluada) }
  const [preguntas, setPreguntas] = useState([]); // cuestionario opcional: sí/no, numérica, texto libre
  const [guardando, setGuardando] = useState(false);

  // Calificación manual de las respuestas de texto libre de una evaluación
  // ya respondida por el colaborador (las de sí/no y numérica ya se
  // autocalificaron al responder — ver backend crearEvaluacion/responder).
  const [calificandoEval, setCalificandoEval] = useState(null); // evaluación | null
  const [puntosCalificar, setPuntosCalificar] = useState({}); // { respuestaId: puntos }
  const [comentariosCalificar, setComentariosCalificar] = useState({}); // { respuestaId: comentario }
  const [guardandoCalificacion, setGuardandoCalificacion] = useState(false);

  function cargar() {
    api.get('/empresa/evaluaciones').then((res) => setEvaluaciones(res.data.data)).catch(() => {});
    api.get('/tipos-evaluacion').then((res) => setTiposEvaluacion(res.data.data)).catch(() => {});
    api.get('/competencias').then((res) => setCompetencias(res.data.data)).catch(() => {});
    api.get('/empresa/colaboradores', { params: { pageSize: 200 } }).then((res) => setColaboradores(res.data.data)).catch(() => {});
    api.get('/cursos', { params: { pageSize: 200 } }).then((res) => setCursos(res.data.data)).catch(() => {});
  }

  useEffect(cargar, []);

  function abrirCrear() {
    setColaboradorId('');
    setTipoEvaluacionId('');
    setPeriodo('');
    setPuntajes({});
    setPreguntas([]);
    setError('');
    setModalAbierto(true);
  }

  function agregarPregunta() {
    setPreguntas((lista) => [...lista, { ...PREGUNTA_VACIA }]);
  }
  function actualizarPregunta(idx, campo, valor) {
    setPreguntas((lista) => lista.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));
  }
  function quitarPregunta(idx) {
    setPreguntas((lista) => lista.filter((_, i) => i !== idx));
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const competenciasEvaluadas = Object.entries(puntajes)
      .filter(([, puntaje]) => Number(puntaje) > 0)
      .map(([competenciaId, puntaje]) => ({ competenciaId: Number(competenciaId), puntaje: Number(puntaje) }));

    // Preguntas con texto vacío se descartan en vez de rechazar todo el
    // envío: evita perder el resto del formulario por una fila que el
    // usuario dejó a medias mientras armaba el cuestionario.
    const preguntasValidas = preguntas.filter((p) => p.texto.trim());

    if (!competenciasEvaluadas.length && !preguntasValidas.length) {
      setError('Califica al menos una competencia (1 a 5) o agrega al menos una pregunta de cuestionario.');
      return;
    }

    setGuardando(true);
    try {
      await api.post('/empresa/evaluaciones', {
        colaboradorId: Number(colaboradorId),
        tipoEvaluacionId: Number(tipoEvaluacionId),
        periodo,
        competencias: competenciasEvaluadas,
        preguntas: preguntasValidas.map((p) => ({
          tipo: p.tipo,
          texto: p.texto.trim(),
          puntos: Number(p.puntos) || 1,
          ...(p.tipo === 'si_no' ? { respuestaCorrectaSiNo: Boolean(p.respuestaCorrectaSiNo) } : {}),
          ...(p.tipo === 'numerica' ? { respuestaCorrectaNumerica: Number(p.respuestaCorrectaNumerica) } : {}),
        })),
      });
      setModalAbierto(false);
      setMensaje(
        preguntasValidas.length
          ? 'Evaluación registrada. El colaborador ya puede responder el cuestionario; verás la nota aquí cuando la conteste (y la califiques, si tiene preguntas de texto libre).'
          : 'Evaluación registrada. El Plan Individual de Desarrollo se generó automáticamente para los gaps detectados (puntaje ≤ 2).'
      );
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible registrar la evaluación.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirCalificar(evaluacion) {
    setError('');
    setCalificandoEval(evaluacion);
    const puntosIniciales = {};
    const comentariosIniciales = {};
    for (const r of evaluacion.EvaluacionRespuestas || []) {
      if (!r.calificada) {
        puntosIniciales[r.id] = '';
        comentariosIniciales[r.id] = '';
      }
    }
    setPuntosCalificar(puntosIniciales);
    setComentariosCalificar(comentariosIniciales);
  }

  async function guardarCalificacion(e) {
    e.preventDefault();
    setError('');
    const respuestas = Object.entries(puntosCalificar)
      .filter(([, puntos]) => puntos !== '')
      .map(([respuestaId, puntos]) => ({
        respuestaId: Number(respuestaId),
        puntosObtenidos: Number(puntos),
        comentario: comentariosCalificar[respuestaId] || undefined,
      }));
    if (!respuestas.length) {
      setError('Asigna un puntaje a al menos una respuesta de texto libre.');
      return;
    }
    setGuardandoCalificacion(true);
    try {
      const { data } = await api.patch(`/empresa/evaluaciones/${calificandoEval.id}/calificar`, { respuestas });
      setCalificandoEval(null);
      setMensaje(
        data.data?.cerrada
          ? 'Calificación guardada. La evaluación quedó cerrada y el colaborador ya puede ver su nota.'
          : 'Calificación guardada. Todavía quedan respuestas de texto libre sin calificar en esta evaluación.'
      );
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar la calificación.');
    } finally {
      setGuardandoCalificacion(false);
    }
  }

  // Antes solo se podía "hacer clic para avanzar el estado" del PID, sin
  // poder asignar realmente un curso de la Academia Virtual — por eso RRHH
  // decía que "no hacía nada". Ahora cada item del PID tiene dos controles
  // explícitos: el estado (sugerido/en progreso/completado) y, opcionalmente,
  // el curso real que el colaborador debe tomar para cerrar ese gap.
  async function cambiarEstadoPid(plan, estado) {
    setError('');
    try {
      await api.patch(`/empresa/evaluaciones/pid/${plan.id}`, { estado });
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible actualizar el estado del plan de desarrollo.');
    }
  }

  async function asignarCursoPid(plan, cursoId) {
    setError('');
    try {
      await api.patch(`/empresa/evaluaciones/pid/${plan.id}`, { cursoId: cursoId ? Number(cursoId) : null });
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible asignar el curso.');
    }
  }

  return (
    <div>
      <h2>Módulo de Evaluación de Desempeño Automatizada</h2>
      {error && !modalAbierto && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="eval-config">
        <div className="config-panel">
          <h3>Tipos de Evaluación disponibles</h3>
          <ul>
            {tiposEvaluacion.map((t) => (
              <li key={t.id}>{t.nombre}</li>
            ))}
          </ul>
        </div>
        <div className="config-panel">
          <h3>Diccionario de Competencias Activas</h3>
          <div className="competencies-list">
            {competencias.map((c) => (
              <span className="badge-comp" key={c.id}>{c.nombre}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="pid-box" style={{ marginTop: 30 }}>
        <h3>Automatización: Plan Individual de Desarrollo (PID)</h3>
        <p>
          Al registrar una evaluación con una competencia puntuada en 1 o 2, el sistema detecta el gap y crea
          automáticamente un item de PID para ese colaborador. Debajo de cada gap puedes:
        </p>
        <ul style={{ margin: '8px 0 0 18px', fontSize: 13 }}>
          <li><strong>Asignar un curso real</strong> de la Academia Virtual que ataque ese gap — el colaborador lo verá recomendado en su Expediente.</li>
          <li><strong>Cambiar el estado</strong> a mano: <em>Sugerido</em> (recién detectado, sin acción tomada), <em>En progreso</em> (el colaborador ya inició el curso o la acción) y <em>Completado</em> (ya cerró el gap).</li>
        </ul>
      </div>

      <div className="toolbar" style={{ marginTop: 30 }}>
        <h2 style={{ marginBottom: 0 }}>Evaluaciones registradas</h2>
        <PermissionGate permiso="evaluaciones.crear">
          <button className="btn-primary btn-icon" style={{ width: 'auto' }} onClick={abrirCrear}>
            <IconPlus width={14} height={14} /> Nueva evaluación
          </button>
        </PermissionGate>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 15 }}>
        {evaluaciones.map((e) => (
          <div key={e.id} className="exp-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{e.Colaborador?.Usuario?.nombre}</strong> — {e.TipoEvaluacion?.nombre} · periodo {e.periodo}
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {e.EvaluacionPreguntas?.length > 0 && (
                  <EstadoBadge variante={VARIANTE_ESTADO_EVAL[e.estado]}>{ETIQUETAS_ESTADO_EVAL[e.estado]}</EstadoBadge>
                )}
                {!e.EvaluacionPreguntas?.length && <EstadoBadge variante={e.estado === 'cerrada' ? 'neutro' : 'info'}>{e.estado}</EstadoBadge>}
                {e.estado === 'en_progreso' && e.pendientesCalificar > 0 && (
                  <PermissionGate permiso="evaluaciones.actualizar">
                    <button className="btn-icon-only" data-tooltip={`Calificar ${e.pendientesCalificar} respuesta(s) de texto libre`} onClick={() => abrirCalificar(e)}>
                      <IconClipboardList />
                    </button>
                  </PermissionGate>
                )}
              </span>
            </div>

            {e.EvaluacionPreguntas?.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                Cuestionario de {e.EvaluacionPreguntas.length} pregunta(s)
                {e.requiere_calificacion_manual && ' · incluye texto libre (requiere calificación manual)'}
                {e.estado === 'abierta' && ' · el colaborador todavía no ha respondido.'}
                {e.estado === 'en_progreso' && ' · el colaborador ya respondió; su nota queda oculta hasta calificar el texto libre.'}
                {e.estado === 'cerrada' && (
                  <strong style={{ color: 'var(--text-main)' }}> · Nota: {Number(e.nota_final ?? 0).toFixed(1)} / {Number(e.puntos_totales ?? 0).toFixed(1)}</strong>
                )}
              </div>
            )}

            {e.PlanDesarrollos?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                  Plan Individual de Desarrollo (PID)
                </p>
                <ul className="simple-list" style={{ marginTop: 0 }}>
                  {e.PlanDesarrollos.map((p) => (
                    <li key={p.id} style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>
                          Gap detectado: <strong>{p.gap_detectado}</strong>
                          {p.Curso ? <> → curso asignado: <strong>{p.Curso.titulo}</strong></> : ' → sin curso asignado todavía'}
                        </span>
                        <EstadoBadge variante={VARIANTE_PID[p.estado]}>{ETIQUETAS_PID[p.estado]}</EstadoBadge>
                      </div>
                      <PermissionGate permiso="evaluaciones.actualizar">
                        <div className="inline-form" style={{ alignItems: 'center' }}>
                          <select value={p.estado} onChange={(ev) => cambiarEstadoPid(p, ev.target.value)}>
                            <option value="sugerido">Sugerido</option>
                            <option value="en_progreso">En progreso</option>
                            <option value="completado">Completado</option>
                          </select>
                          <select value={p.curso_id || ''} onChange={(ev) => asignarCursoPid(p, ev.target.value)} style={{ flex: 1 }}>
                            <option value="">Sin curso asignado</option>
                            {cursos.map((c) => (
                              <option key={c.id} value={c.id}>{c.titulo}</option>
                            ))}
                          </select>
                        </div>
                      </PermissionGate>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!e.PlanDesarrollos?.length && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
                Sin acciones de PID: todas las competencias evaluadas obtuvieron puntaje 3 o más (sin gaps detectados).
              </p>
            )}
          </div>
        ))}
        {evaluaciones.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aún no hay evaluaciones registradas.</p>}
      </div>

      {modalAbierto && (
        <Modal titulo="Nueva evaluación de desempeño" onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            {error && <div className="alert-error">{error}</div>}

            <label>Colaborador</label>
            <select required value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}>
              <option value="" disabled>Selecciona…</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>{c.Usuario?.nombre} — {c.cargo}</option>
              ))}
            </select>

            <label>Tipo de evaluación</label>
            <select required value={tipoEvaluacionId} onChange={(e) => setTipoEvaluacionId(e.target.value)}>
              <option value="" disabled>Selecciona…</option>
              {tiposEvaluacion.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>

            <label>Periodo</label>
            <input required value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-Q1" />

            <label>Competencias (opcional — califica de 1 a 5 tú mismo; deja en "—" las que no aplican)</label>
            {competencias.map((c) => (
              <div key={c.id} className="inline-form" style={{ alignItems: 'center', marginTop: 6 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{c.nombre}</span>
                <select value={puntajes[c.id] || 0} onChange={(e) => setPuntajes({ ...puntajes, [c.id]: e.target.value })}>
                  <option value={0}>—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            ))}

            <label style={{ marginTop: 12 }}>
              Cuestionario (opcional — lo responde el colaborador). Sí/no y numérica se califican solas; texto libre lo calificas tú después.
            </label>
            {preguntas.map((p, idx) => (
              <div key={idx} style={{ border: '1px solid var(--gray-border)', borderRadius: 'var(--radius-sm)', padding: 10, marginTop: 8 }}>
                <div className="inline-form" style={{ alignItems: 'center' }}>
                  <input
                    style={{ flex: 2 }}
                    placeholder="Texto de la pregunta"
                    value={p.texto}
                    onChange={(e) => actualizarPregunta(idx, 'texto', e.target.value)}
                  />
                  <select value={p.tipo} onChange={(e) => actualizarPregunta(idx, 'tipo', e.target.value)}>
                    <option value="si_no">Sí / No</option>
                    <option value="numerica">Numérica</option>
                    <option value="texto_libre">Texto libre</option>
                  </select>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    style={{ width: 70 }}
                    title="Puntos que vale esta pregunta"
                    value={p.puntos}
                    onChange={(e) => actualizarPregunta(idx, 'puntos', e.target.value)}
                  />
                  <button type="button" className="btn-icon-only btn-danger" data-tooltip="Quitar" onClick={() => quitarPregunta(idx)}>
                    <IconTrash />
                  </button>
                </div>
                {p.tipo === 'si_no' && (
                  <label className="checkbox-label" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(p.respuestaCorrectaSiNo)}
                      onChange={(e) => actualizarPregunta(idx, 'respuestaCorrectaSiNo', e.target.checked)}
                    />
                    La respuesta correcta es "Sí" (destildar si la correcta es "No")
                  </label>
                )}
                {p.tipo === 'numerica' && (
                  <div className="inline-form" style={{ alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 13 }}>Respuesta correcta:</span>
                    <input
                      type="number"
                      step="any"
                      style={{ width: 120 }}
                      value={p.respuestaCorrectaNumerica}
                      onChange={(e) => actualizarPregunta(idx, 'respuestaCorrectaNumerica', e.target.value)}
                    />
                  </div>
                )}
                {p.tipo === 'texto_libre' && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    Sin respuesta correcta: la calificas tú manualmente cuando el colaborador la conteste.
                  </p>
                )}
              </div>
            ))}
            <button type="button" className="btn-xs" style={{ marginTop: 8, width: 'fit-content' }} onClick={agregarPregunta}>+ Agregar pregunta</button>

            <button className="btn-primary" type="submit" disabled={guardando} style={{ marginTop: 15 }}>
              {guardando ? 'Guardando…' : 'Registrar evaluación'}
            </button>
          </form>
        </Modal>
      )}

      {calificandoEval && (
        <Modal titulo={`Calificar texto libre — ${calificandoEval.Colaborador?.Usuario?.nombre}`} onClose={() => setCalificandoEval(null)}>
          <form onSubmit={guardarCalificacion} className="form-grid">
            {error && <div className="alert-error">{error}</div>}
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Asigna el puntaje de cada respuesta de texto libre (máximo el puntaje de la pregunta). Cuando todas queden calificadas,
              la evaluación se cierra automáticamente y el colaborador podrá ver su nota.
            </p>
            {(calificandoEval.EvaluacionRespuestas || [])
              .filter((r) => !r.calificada)
              .map((r) => {
                const pregunta = (calificandoEval.EvaluacionPreguntas || []).find((p) => p.id === r.pregunta_id);
                return (
                  <div key={r.id} style={{ border: '1px solid var(--gray-border)', borderRadius: 'var(--radius-sm)', padding: 10, marginTop: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>{pregunta?.texto || 'Pregunta'}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Respuesta: "{r.valor_texto}"</p>
                    <div className="inline-form" style={{ alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 13 }}>Puntos (máx. {pregunta ? Number(pregunta.puntos) : '—'}):</span>
                      <input
                        type="number"
                        min="0"
                        max={pregunta ? Number(pregunta.puntos) : undefined}
                        step="0.1"
                        style={{ width: 90 }}
                        value={puntosCalificar[r.id] ?? ''}
                        onChange={(e) => setPuntosCalificar({ ...puntosCalificar, [r.id]: e.target.value })}
                      />
                    </div>
                    <input
                      style={{ marginTop: 8 }}
                      placeholder="Comentario opcional para el colaborador"
                      value={comentariosCalificar[r.id] || ''}
                      onChange={(e) => setComentariosCalificar({ ...comentariosCalificar, [r.id]: e.target.value })}
                    />
                  </div>
                );
              })}
            <button className="btn-primary" type="submit" disabled={guardandoCalificacion} style={{ marginTop: 15 }}>
              {guardandoCalificacion ? 'Guardando…' : 'Guardar calificación'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
