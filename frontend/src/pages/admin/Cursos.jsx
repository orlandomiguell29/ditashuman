import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import EstadoBadge from '../../components/EstadoBadge';
import { IconEdit, IconBan, IconCheckCircle, IconVideo, IconQuiz, IconPlus, IconTrash } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';

const vacio = { titulo: '', descripcion: '', categoriaId: '', duracionHoras: '', videosCount: '', rating: '', otorgaCertificado: true, maxIntentosEvaluacion: 2 };
const videoVacio = { titulo: '', urlYoutube: '', duracionMinutos: '' };
const preguntaVacia = { texto: '', opciones: ['', ''], respuestaCorrecta: 0 };

export default function AdminCursos() {
  const { tienePermiso } = useAuth();
  const [cursos, setCursos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState('');

  // Gestión de videos (enlaces de YouTube) del curso seleccionado.
  const [cursoVideos, setCursoVideos] = useState(null); // curso cuyo modal de videos está abierto
  const [videos, setVideos] = useState([]);
  const [formVideo, setFormVideo] = useState(videoVacio);
  // Un mismo formulario sirve para agregar y para editar: `editandoVideoId`
  // marca cuál fila está en modo edición (null = el formulario de abajo
  // agrega uno nuevo). Así cambiar el link de un video ya existente se hace
  // desde su propio botón "Editar" en la fila, no en un flujo aparte.
  const [editandoVideoId, setEditandoVideoId] = useState(null);
  const [errorVideo, setErrorVideo] = useState('');

  // Gestión de la evaluación final (preguntas de opción múltiple) del curso
  // seleccionado. Mismo patrón que los videos: un formulario, y
  // `editandoPreguntaId` decide si agrega una nueva o edita una existente.
  const [cursoPreguntas, setCursoPreguntas] = useState(null);
  const [preguntas, setPreguntas] = useState([]);
  const [formPregunta, setFormPregunta] = useState(preguntaVacia);
  const [editandoPreguntaId, setEditandoPreguntaId] = useState(null);
  const [errorPregunta, setErrorPregunta] = useState('');

  function cargar() {
    api.get('/cursos', { params: { incluirInactivos, pageSize: 100 } }).then((res) => setCursos(res.data.data)).catch(() => setError('No fue posible cargar los cursos.'));
    api.get('/categorias').then((res) => setCategorias(res.data.data)).catch(() => {});
  }
  useEffect(cargar, [incluirInactivos]);

  function abrirCrear() {
    setEditando(null);
    setForm(vacio);
    setModalAbierto(true);
  }

  function abrirEditar(curso) {
    setEditando(curso);
    setForm({
      titulo: curso.titulo,
      descripcion: curso.descripcion || '',
      categoriaId: curso.categoria_id || '',
      duracionHoras: curso.duracion_horas,
      videosCount: curso.videos_count,
      rating: curso.rating || '',
      otorgaCertificado: curso.otorga_certificado,
      maxIntentosEvaluacion: curso.max_intentos_evaluacion || 2,
    });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const payload = {
      titulo: form.titulo,
      descripcion: form.descripcion || undefined,
      categoriaId: form.categoriaId || undefined,
      duracionHoras: Number(form.duracionHoras),
      videosCount: Number(form.videosCount),
      rating: form.rating ? Number(form.rating) : undefined,
      otorgaCertificado: form.otorgaCertificado,
      maxIntentosEvaluacion: Number(form.maxIntentosEvaluacion) || 2,
    };
    try {
      if (editando) await api.put(`/cursos/${editando.id}`, payload);
      else await api.post('/cursos', payload);
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar el curso.');
    }
  }

  function abrirVideos(curso) {
    setCursoVideos(curso);
    setFormVideo(videoVacio);
    setEditandoVideoId(null);
    setErrorVideo('');
    api
      .get(`/cursos/${curso.id}/videos`)
      .then((res) => setVideos(res.data.data))
      .catch((err) => setErrorVideo(err.response?.data?.error || 'No fue posible cargar los videos.'));
  }

  function iniciarEdicionVideo(v) {
    setEditandoVideoId(v.id);
    setFormVideo({ titulo: v.titulo, urlYoutube: v.url_youtube, duracionMinutos: v.duracion_minutos || '' });
    setErrorVideo('');
  }

  function cancelarEdicionVideo() {
    setEditandoVideoId(null);
    setFormVideo(videoVacio);
    setErrorVideo('');
  }

  async function guardarVideo(e) {
    e.preventDefault();
    setErrorVideo('');
    const payload = {
      titulo: formVideo.titulo,
      urlYoutube: formVideo.urlYoutube,
      duracionMinutos: formVideo.duracionMinutos ? Number(formVideo.duracionMinutos) : undefined,
    };
    try {
      if (editandoVideoId) {
        await api.put(`/cursos/${cursoVideos.id}/videos/${editandoVideoId}`, payload);
      } else {
        await api.post(`/cursos/${cursoVideos.id}/videos`, payload);
      }
      setFormVideo(videoVacio);
      setEditandoVideoId(null);
      abrirVideos(cursoVideos);
    } catch (err) {
      setErrorVideo(err.response?.data?.error || 'No fue posible guardar el video.');
    }
  }

  async function quitarVideo(video) {
    if (!window.confirm(`¿Quitar el video "${video.titulo}" del curso?`)) return;
    setErrorVideo('');
    try {
      await api.patch(`/cursos/${cursoVideos.id}/videos/${video.id}/inactivar`);
      abrirVideos(cursoVideos);
    } catch (err) {
      setErrorVideo(err.response?.data?.error || 'No fue posible quitar el video.');
    }
  }

  function abrirPreguntas(curso) {
    setCursoPreguntas(curso);
    setFormPregunta(preguntaVacia);
    setEditandoPreguntaId(null);
    setErrorPregunta('');
    api
      .get(`/cursos/${curso.id}/preguntas`)
      .then((res) => setPreguntas(res.data.data))
      .catch((err) => setErrorPregunta(err.response?.data?.error || 'No fue posible cargar la evaluación.'));
  }

  function iniciarEdicionPregunta(p) {
    setEditandoPreguntaId(p.id);
    setFormPregunta({ texto: p.texto, opciones: [...p.opciones], respuestaCorrecta: p.respuesta_correcta });
    setErrorPregunta('');
  }

  function cancelarEdicionPregunta() {
    setEditandoPreguntaId(null);
    setFormPregunta(preguntaVacia);
    setErrorPregunta('');
  }

  function actualizarOpcion(idx, valor) {
    setFormPregunta((f) => ({ ...f, opciones: f.opciones.map((o, i) => (i === idx ? valor : o)) }));
  }
  function agregarOpcion() {
    setFormPregunta((f) => (f.opciones.length >= 5 ? f : { ...f, opciones: [...f.opciones, ''] }));
  }
  function quitarOpcion(idx) {
    setFormPregunta((f) => {
      if (f.opciones.length <= 2) return f;
      const opciones = f.opciones.filter((_, i) => i !== idx);
      const respuestaCorrecta = f.respuestaCorrecta >= opciones.length ? 0 : f.respuestaCorrecta;
      return { ...f, opciones, respuestaCorrecta };
    });
  }

  async function guardarPregunta(e) {
    e.preventDefault();
    setErrorPregunta('');
    if (formPregunta.opciones.some((o) => !o.trim())) {
      setErrorPregunta('Completa el texto de todas las opciones.');
      return;
    }
    const payload = { texto: formPregunta.texto, opciones: formPregunta.opciones, respuestaCorrecta: Number(formPregunta.respuestaCorrecta) };
    try {
      if (editandoPreguntaId) {
        await api.put(`/cursos/${cursoPreguntas.id}/preguntas/${editandoPreguntaId}`, payload);
      } else {
        await api.post(`/cursos/${cursoPreguntas.id}/preguntas`, payload);
      }
      setFormPregunta(preguntaVacia);
      setEditandoPreguntaId(null);
      abrirPreguntas(cursoPreguntas);
    } catch (err) {
      setErrorPregunta(err.response?.data?.error || 'No fue posible guardar la pregunta.');
    }
  }

  async function quitarPregunta(pregunta) {
    if (!window.confirm(`¿Quitar la pregunta "${pregunta.texto}" de la evaluación?`)) return;
    setErrorPregunta('');
    try {
      await api.patch(`/cursos/${cursoPreguntas.id}/preguntas/${pregunta.id}/inactivar`);
      abrirPreguntas(cursoPreguntas);
    } catch (err) {
      setErrorPregunta(err.response?.data?.error || 'No fue posible quitar la pregunta.');
    }
  }

  async function toggleActivo(curso) {
    const accion = curso.activo ? 'inactivar' : 'activar';
    try {
      await api.patch(`/cursos/${curso.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} el curso.`);
    }
  }

  const columns = [
    { key: 'titulo', header: 'Título' },
    { key: 'duracion_horas', header: 'Duración (hrs)' },
    { key: 'videos_count', header: 'Videos' },
    { key: 'rating', header: 'Rating' },
    { key: 'max_intentos_evaluacion', header: 'Máx. intentos', render: (r) => r.max_intentos_evaluacion || 2 },
    { key: 'activo', header: 'Estado', render: (r) => <EstadoBadge variante={r.activo ? 'exito' : 'neutro'}>{r.activo ? 'Activo' : 'Inactivo'}</EstadoBadge> },
  ];

  return (
    <div>
      <h2>Academia Virtual — Gestión de Cursos</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <PermissionGate permiso="cursos.crear">
          <button className="btn-primary btn-icon" style={{ width: 'auto' }} onClick={abrirCrear}>
            <IconPlus width={14} height={14} /> Nuevo curso
          </button>
        </PermissionGate>
        <label className="checkbox-label">
          <input type="checkbox" checked={incluirInactivos} onChange={(e) => setIncluirInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
        <ExportButtons endpoint="/cursos/export" nombreArchivo="cursos_ditash" disabled={!tienePermiso('cursos.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-cursos"
        columns={columns}
        rows={cursos}
        acciones={(row) => (
          <>
            <PermissionGate permiso="cursos.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
            </PermissionGate>
            <PermissionGate permiso="cursos.crear">
              <button className="btn-icon-only" data-tooltip="Videos" onClick={() => abrirVideos(row)}>
                <IconVideo />
              </button>
            </PermissionGate>
            <PermissionGate permiso="cursos.crear">
              <button className="btn-icon-only" data-tooltip="Evaluación final" onClick={() => abrirPreguntas(row)}>
                <IconQuiz />
              </button>
            </PermissionGate>
            <PermissionGate permiso="cursos.inactivar">
              <button
                className={`btn-icon-only ${row.activo ? 'btn-danger' : ''}`}
                data-tooltip={row.activo ? 'Inactivar' : 'Activar'}
                onClick={() => toggleActivo(row)}
              >
                {row.activo ? <IconBan /> : <IconCheckCircle />}
              </button>
            </PermissionGate>
          </>
        )}
      />

      {modalAbierto && (
        <Modal titulo={editando ? 'Editar curso' : 'Nuevo curso'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            <label>Título</label>
            <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />

            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />

            <label>Categoría</label>
            <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.titulo}</option>
              ))}
            </select>

            <label>Duración (horas)</label>
            <input type="number" step="0.5" min="0" required value={form.duracionHoras} onChange={(e) => setForm({ ...form, duracionHoras: e.target.value })} />

            <label># de videos (referencial)</label>
            <input type="number" min="0" required value={form.videosCount} onChange={(e) => setForm({ ...form, videosCount: e.target.value })} />
            <small style={{ color: 'var(--text-muted)' }}>El progreso real de los colaboradores se calcula sobre los videos cargados en "Videos", no sobre este número.</small>

            <label>Rating (0 a 5, opcional)</label>
            <input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />

            <label className="checkbox-label" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={form.otorgaCertificado} onChange={(e) => setForm({ ...form, otorgaCertificado: e.target.checked })} />
              Otorga certificado al finalizar
            </label>

            <label>Máximo de intentos de la evaluación final</label>
            <input
              type="number"
              min="1"
              max="20"
              required
              value={form.maxIntentosEvaluacion}
              onChange={(e) => setForm({ ...form, maxIntentosEvaluacion: e.target.value })}
            />
            <small style={{ color: 'var(--text-muted)' }}>
              Si el colaborador no aprueba dentro de este número de intentos, deberá pedirle a RRHH que le reinicie los intentos
              (desde Empresa &gt; Colaboradores).
            </small>

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>Guardar</button>
          </form>
        </Modal>
      )}

      {cursoVideos && (
        <Modal titulo={`Videos de "${cursoVideos.titulo}"`} onClose={() => setCursoVideos(null)}>
          {errorVideo && <div className="alert-error">{errorVideo}</div>}

          <ul className="simple-list">
            {videos.map((v, idx) =>
              editandoVideoId === v.id ? (
                <li key={v.id} style={{ padding: '10px 0' }}>
                  <form onSubmit={guardarVideo} className="form-grid">
                    <label>Título del video</label>
                    <input required value={formVideo.titulo} onChange={(e) => setFormVideo({ ...formVideo, titulo: e.target.value })} />
                    <label>Enlace de YouTube</label>
                    <input required type="url" value={formVideo.urlYoutube} onChange={(e) => setFormVideo({ ...formVideo, urlYoutube: e.target.value })} />
                    <label>Duración (minutos, opcional)</label>
                    <input type="number" min="0" value={formVideo.duracionMinutos} onChange={(e) => setFormVideo({ ...formVideo, duracionMinutos: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn-primary" style={{ width: 'auto' }} type="submit">Guardar cambios</button>
                      <button className="btn-secondary" style={{ width: 'auto' }} type="button" onClick={cancelarEdicionVideo}>Cancelar</button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>
                    {idx + 1}. {v.titulo} {v.duracion_minutos ? `(${v.duracion_minutos} min)` : ''}
                    <br />
                    <a href={v.url_youtube} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{v.url_youtube}</a>
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn-icon-only" data-tooltip="Editar" onClick={() => iniciarEdicionVideo(v)}>
                      <IconEdit />
                    </button>
                    <button type="button" className="btn-icon-only btn-danger" data-tooltip="Quitar" onClick={() => quitarVideo(v)}>
                      <IconTrash />
                    </button>
                  </span>
                </li>
              )
            )}
            {videos.length === 0 && <li style={{ color: 'var(--text-muted)' }}>Este curso todavía no tiene videos.</li>}
          </ul>

          {editandoVideoId === null && (
            <form onSubmit={guardarVideo} className="form-grid" style={{ marginTop: 15 }}>
              <label>Título del video</label>
              <input required value={formVideo.titulo} onChange={(e) => setFormVideo({ ...formVideo, titulo: e.target.value })} />

              <label>Enlace de YouTube</label>
              <input
                type="url"
                required
                placeholder="https://www.youtube.com/watch?v=..."
                value={formVideo.urlYoutube}
                onChange={(e) => setFormVideo({ ...formVideo, urlYoutube: e.target.value })}
              />

              <label>Duración (minutos, opcional)</label>
              <input
                type="number"
                min="0"
                value={formVideo.duracionMinutos}
                onChange={(e) => setFormVideo({ ...formVideo, duracionMinutos: e.target.value })}
              />

              <button className="btn-primary btn-icon" style={{ marginTop: 15 }} type="submit">
                <IconPlus width={14} height={14} /> Agregar video
              </button>
            </form>
          )}
        </Modal>
      )}

      {cursoPreguntas && (
        <Modal titulo={`Evaluación final de "${cursoPreguntas.titulo}"`} onClose={() => setCursoPreguntas(null)}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
            El colaborador debe aprobar esta evaluación (70% o más) además de ver todos los videos para que se active su
            certificado. Sin preguntas aquí, el curso queda solo con el requisito de videos.
          </p>
          {errorPregunta && <div className="alert-error">{errorPregunta}</div>}

          <ul className="simple-list">
            {preguntas.map((p, idx) =>
              editandoPreguntaId === p.id ? (
                <li key={p.id} style={{ padding: '10px 0' }}>
                  <form onSubmit={guardarPregunta} className="form-grid">
                    <label>Pregunta</label>
                    <input required value={formPregunta.texto} onChange={(e) => setFormPregunta({ ...formPregunta, texto: e.target.value })} />
                    <label>Opciones (marca cuál es la correcta)</label>
                    {formPregunta.opciones.map((o, i) => (
                      <div key={i} className="inline-form" style={{ alignItems: 'center', marginTop: 6 }}>
                        <input type="radio" name="correctaEdit" checked={Number(formPregunta.respuestaCorrecta) === i} onChange={() => setFormPregunta({ ...formPregunta, respuestaCorrecta: i })} />
                        <input style={{ flex: 1 }} required value={o} onChange={(e) => actualizarOpcion(i, e.target.value)} />
                        {formPregunta.opciones.length > 2 && (
                          <button type="button" className="btn-xs btn-danger" onClick={() => quitarOpcion(i)}>Quitar</button>
                        )}
                      </div>
                    ))}
                    {formPregunta.opciones.length < 5 && (
                      <button type="button" className="btn-xs" style={{ marginTop: 6, width: 'fit-content' }} onClick={agregarOpcion}>+ Agregar opción</button>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn-primary" style={{ width: 'auto' }} type="submit">Guardar cambios</button>
                      <button className="btn-secondary" style={{ width: 'auto' }} type="button" onClick={cancelarEdicionPregunta}>Cancelar</button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={p.id} style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <span>
                      <strong>{idx + 1}. {p.texto}</strong>
                      <ul style={{ margin: '6px 0 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>
                        {p.opciones.map((o, i) => (
                          <li key={i} style={{ color: i === p.respuesta_correcta ? 'var(--success, #16a34a)' : undefined, fontWeight: i === p.respuesta_correcta ? 700 : 400 }}>
                            {o} {i === p.respuesta_correcta ? '✔ correcta' : ''}
                          </li>
                        ))}
                      </ul>
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn-icon-only" data-tooltip="Editar" onClick={() => iniciarEdicionPregunta(p)}>
                        <IconEdit />
                      </button>
                      <button type="button" className="btn-icon-only btn-danger" data-tooltip="Quitar" onClick={() => quitarPregunta(p)}>
                        <IconTrash />
                      </button>
                    </span>
                  </div>
                </li>
              )
            )}
            {preguntas.length === 0 && <li style={{ color: 'var(--text-muted)' }}>Este curso todavía no tiene preguntas de evaluación.</li>}
          </ul>

          {editandoPreguntaId === null && (
            <form onSubmit={guardarPregunta} className="form-grid" style={{ marginTop: 15 }}>
              <label>Pregunta</label>
              <input required value={formPregunta.texto} onChange={(e) => setFormPregunta({ ...formPregunta, texto: e.target.value })} placeholder="¿...?" />

              <label>Opciones (marca cuál es la correcta)</label>
              {formPregunta.opciones.map((o, i) => (
                <div key={i} className="inline-form" style={{ alignItems: 'center', marginTop: 6 }}>
                  <input type="radio" name="correctaNueva" checked={Number(formPregunta.respuestaCorrecta) === i} onChange={() => setFormPregunta({ ...formPregunta, respuestaCorrecta: i })} />
                  <input style={{ flex: 1 }} required placeholder={`Opción ${i + 1}`} value={o} onChange={(e) => actualizarOpcion(i, e.target.value)} />
                  {formPregunta.opciones.length > 2 && (
                    <button type="button" className="btn-xs btn-danger" onClick={() => quitarOpcion(i)}>Quitar</button>
                  )}
                </div>
              ))}
              {formPregunta.opciones.length < 5 && (
                <button type="button" className="btn-xs" style={{ marginTop: 6, width: 'fit-content' }} onClick={agregarOpcion}>+ Agregar opción</button>
              )}

              <button className="btn-primary btn-icon" style={{ marginTop: 15 }} type="submit">
                <IconPlus width={14} height={14} /> Agregar pregunta
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
