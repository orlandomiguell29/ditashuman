import { useState, useEffect } from 'react';
import api from '../../api/axiosClient';
import Modal from '../../components/Modal';
import PermissionGate from '../../components/PermissionGate';
import { IconEye, IconClipboardList, IconLock, IconSave, IconTrash } from '../../components/icons';

const TIPOS = [
  { value: 'felicidad', label: 'Felicidad' },
  { value: 'estres_burnout', label: 'Estrés / Burnout' },
  { value: 'liderazgo', label: 'Liderazgo' },
  { value: 'clima_general', label: 'Clima general' },
];

const PREGUNTA_VACIA = { texto: '', tipo: 'escala_1_5' };

export default function EmpresaClima() {
  const [encuestas, setEncuestas] = useState([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ titulo: '', tipo: 'clima_general', anonima: true, fechaInicio: '', fechaFin: '', preguntas: [{ ...PREGUNTA_VACIA }] });
  const [guardando, setGuardando] = useState(false);

  const [resultados, setResultados] = useState(null); // { encuesta, preguntas } | null

  // Administrar preguntas de una encuesta ya creada: permite corregir/completar
  // encuestas que quedaron con "0 preguntas configuradas" (demo o creadas a mano)
  // sin tener que borrarlas y rehacerlas.
  const [preguntasModal, setPreguntasModal] = useState(null); // encuesta | null
  const [preguntasLista, setPreguntasLista] = useState([]);
  const [nuevaPregunta, setNuevaPregunta] = useState({ ...PREGUNTA_VACIA });
  const [preguntasError, setPreguntasError] = useState('');
  const [guardandoPregunta, setGuardandoPregunta] = useState(false);

  function cargar() {
    api
      .get('/empresa/clima/encuestas')
      .then((res) => setEncuestas(res.data.data))
      .catch(() => setError('No fue posible cargar las encuestas.'));
  }

  useEffect(cargar, []);

  function abrirCrear() {
    setForm({ titulo: '', tipo: 'clima_general', anonima: true, fechaInicio: new Date().toISOString().slice(0, 10), fechaFin: '', preguntas: [{ ...PREGUNTA_VACIA }] });
    setError('');
    setModalAbierto(true);
  }

  function actualizarPregunta(idx, campo, valor) {
    setForm((f) => ({ ...f, preguntas: f.preguntas.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)) }));
  }
  function agregarPregunta() {
    setForm((f) => ({ ...f, preguntas: [...f.preguntas, { ...PREGUNTA_VACIA }] }));
  }
  function quitarPregunta(idx) {
    setForm((f) => ({ ...f, preguntas: f.preguntas.filter((_, i) => i !== idx) }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (form.preguntas.some((p) => !p.texto.trim())) {
      setError('Todas las preguntas deben tener texto.');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/empresa/clima/encuestas', form);
      setModalAbierto(false);
      setMensaje('Encuesta creada y activa para tus colaboradores.');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible crear la encuesta.');
    } finally {
      setGuardando(false);
    }
  }

  async function cerrar(encuesta) {
    if (!window.confirm(`¿Cerrar "${encuesta.titulo}"? Dejará de aceptar respuestas.`)) return;
    setError('');
    try {
      await api.patch(`/empresa/clima/encuestas/${encuesta.id}/cerrar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible cerrar la encuesta.');
    }
  }

  async function verResultados(encuesta) {
    setError('');
    try {
      const { data } = await api.get(`/empresa/clima/encuestas/${encuesta.id}/resultados`);
      setResultados(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible cargar los resultados.');
    }
  }

  async function abrirPreguntas(encuesta) {
    setPreguntasError('');
    setNuevaPregunta({ ...PREGUNTA_VACIA });
    setPreguntasModal(encuesta);
    try {
      const { data } = await api.get(`/empresa/clima/encuestas/${encuesta.id}/preguntas`);
      setPreguntasLista(data.data);
    } catch (err) {
      setPreguntasError(err.response?.data?.error || 'No fue posible cargar las preguntas.');
    }
  }

  async function agregarPreguntaEncuesta(e) {
    e.preventDefault();
    if (!nuevaPregunta.texto.trim()) {
      setPreguntasError('Escribe el texto de la pregunta.');
      return;
    }
    setGuardandoPregunta(true);
    setPreguntasError('');
    try {
      const { data } = await api.post(`/empresa/clima/encuestas/${preguntasModal.id}/preguntas`, nuevaPregunta);
      setPreguntasLista((lista) => [...lista, data.data]);
      setNuevaPregunta({ ...PREGUNTA_VACIA });
      cargar();
    } catch (err) {
      setPreguntasError(err.response?.data?.error || 'No fue posible agregar la pregunta.');
    } finally {
      setGuardandoPregunta(false);
    }
  }

  async function actualizarPreguntaEncuesta(pregunta) {
    setPreguntasError('');
    try {
      const { data } = await api.put(`/empresa/clima/encuestas/${preguntasModal.id}/preguntas/${pregunta.id}`, {
        texto: pregunta.texto,
        tipo: pregunta.tipo,
      });
      setPreguntasLista((lista) => lista.map((p) => (p.id === pregunta.id ? data.data : p)));
    } catch (err) {
      setPreguntasError(err.response?.data?.error || 'No fue posible guardar los cambios.');
    }
  }

  async function eliminarPreguntaEncuesta(pregunta) {
    if (!window.confirm('¿Eliminar esta pregunta? También se borrarán las respuestas ya registradas para ella.')) return;
    setPreguntasError('');
    try {
      await api.delete(`/empresa/clima/encuestas/${preguntasModal.id}/preguntas/${pregunta.id}`);
      setPreguntasLista((lista) => lista.filter((p) => p.id !== pregunta.id));
      cargar();
    } catch (err) {
      setPreguntasError(err.response?.data?.error || 'No fue posible eliminar la pregunta.');
    }
  }

  return (
    <div>
      <h2>Encuestas Periódicas de Clima y Cultura</h2>
      {error && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="toolbar">
        <PermissionGate permiso="clima.crear">
          <button className="btn-primary" style={{ width: 'auto' }} onClick={abrirCrear}>+ Nueva encuesta</button>
        </PermissionGate>
      </div>

      <div className="clima-grid">
        {encuestas.map((enc) => (
          <div key={enc.id} className="clima-card-item">
            <h4>{enc.titulo}</h4>
            <p>
              Tipo: {enc.tipo} · {enc.anonima ? 'Anónima' : 'Identificada'} · Estado: {enc.estado}
            </p>
            <p>{enc.EncuestaPreguntas?.length || 0} preguntas configuradas</p>
            <div className="inline-form" style={{ marginTop: 10 }}>
              <button className="btn-icon-only" data-tooltip="Ver resultados" onClick={() => verResultados(enc)}>
                <IconEye />
              </button>
              <PermissionGate permiso="clima.crear">
                <button
                  className={`btn-icon-only ${(enc.EncuestaPreguntas?.length || 0) === 0 ? 'btn-danger' : ''}`}
                  data-tooltip={(enc.EncuestaPreguntas?.length || 0) === 0 ? 'Administrar preguntas (sin preguntas configuradas)' : 'Administrar preguntas'}
                  onClick={() => abrirPreguntas(enc)}
                >
                  <IconClipboardList />
                </button>
              </PermissionGate>
              <PermissionGate permiso="clima.actualizar">
                {enc.estado === 'activa' && (
                  <button className="btn-icon-only btn-danger" data-tooltip="Cerrar encuesta" onClick={() => cerrar(enc)}>
                    <IconLock />
                  </button>
                )}
              </PermissionGate>
            </div>
          </div>
        ))}
        {encuestas.length === 0 && !error && <p>Aún no hay encuestas configuradas para tu empresa.</p>}
      </div>

      {modalAbierto && (
        <Modal titulo="Nueva encuesta de clima" onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            {error && <div className="alert-error">{error}</div>}

            <label>Título</label>
            <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />

            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <label className="checkbox-label" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={form.anonima} onChange={(e) => setForm({ ...form, anonima: e.target.checked })} />
              Encuesta anónima (recomendado para temas sensibles como burnout)
            </label>

            <label>Fecha inicio</label>
            <input type="date" required value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} />

            <label>Fecha fin</label>
            <input type="date" required value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} />

            <label>Preguntas</label>
            {form.preguntas.map((p, idx) => (
              <div key={idx} className="inline-form" style={{ marginTop: 6 }}>
                <input
                  style={{ flex: 2 }}
                  placeholder="Texto de la pregunta"
                  value={p.texto}
                  onChange={(e) => actualizarPregunta(idx, 'texto', e.target.value)}
                />
                <select value={p.tipo} onChange={(e) => actualizarPregunta(idx, 'tipo', e.target.value)}>
                  <option value="escala_1_5">Escala 1-5</option>
                  <option value="si_no">Sí / No</option>
                  <option value="texto_libre">Texto libre</option>
                </select>
                {form.preguntas.length > 1 && (
                  <button type="button" className="btn-icon-only btn-danger" data-tooltip="Quitar" onClick={() => quitarPregunta(idx)}>
                    <IconTrash />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-xs" style={{ marginTop: 8, width: 'fit-content' }} onClick={agregarPregunta}>+ Agregar pregunta</button>

            <button className="btn-primary" type="submit" disabled={guardando} style={{ marginTop: 15 }}>
              {guardando ? 'Creando…' : 'Crear encuesta'}
            </button>
          </form>
        </Modal>
      )}

      {preguntasModal && (
        <Modal titulo={`Preguntas: ${preguntasModal.titulo}`} onClose={() => setPreguntasModal(null)}>
          {preguntasError && <div className="alert-error">{preguntasError}</div>}
          {preguntasLista.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Esta encuesta no tiene preguntas todavía — por eso los colaboradores no pueden diligenciarla.
              Agrega al menos una pregunta abajo.
            </p>
          )}
          <ul className="simple-list">
            {preguntasLista.map((p) => (
              <li key={p.id} className="inline-form" style={{ marginBottom: 8, alignItems: 'center' }}>
                <input
                  style={{ flex: 2 }}
                  value={p.texto}
                  onChange={(e) => setPreguntasLista((lista) => lista.map((x) => (x.id === p.id ? { ...x, texto: e.target.value } : x)))}
                />
                <select
                  value={p.tipo}
                  onChange={(e) => setPreguntasLista((lista) => lista.map((x) => (x.id === p.id ? { ...x, tipo: e.target.value } : x)))}
                >
                  <option value="escala_1_5">Escala 1-5</option>
                  <option value="si_no">Sí / No</option>
                  <option value="texto_libre">Texto libre</option>
                </select>
                <button type="button" className="btn-icon-only" data-tooltip="Guardar" onClick={() => actualizarPreguntaEncuesta(p)}>
                  <IconSave />
                </button>
                <button type="button" className="btn-icon-only btn-danger" data-tooltip="Eliminar" onClick={() => eliminarPreguntaEncuesta(p)}>
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={agregarPreguntaEncuesta} className="inline-form" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <input
              style={{ flex: 2 }}
              placeholder="Texto de la nueva pregunta"
              value={nuevaPregunta.texto}
              onChange={(e) => setNuevaPregunta({ ...nuevaPregunta, texto: e.target.value })}
            />
            <select value={nuevaPregunta.tipo} onChange={(e) => setNuevaPregunta({ ...nuevaPregunta, tipo: e.target.value })}>
              <option value="escala_1_5">Escala 1-5</option>
              <option value="si_no">Sí / No</option>
              <option value="texto_libre">Texto libre</option>
            </select>
            <button className="btn-primary" style={{ width: 'auto' }} type="submit" disabled={guardandoPregunta}>
              {guardandoPregunta ? 'Agregando…' : '+ Agregar'}
            </button>
          </form>
        </Modal>
      )}

      {resultados && (
        <Modal titulo={`Resultados: ${resultados.encuesta.titulo}`} onClose={() => setResultados(null)}>
          {resultados.preguntas.map((p) => (
            <div key={p.preguntaId} className="exp-section" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 13 }}>{p.texto}</strong>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.totalRespuestas} respuestas</p>
              {p.tipo === 'escala_1_5' && <p>Promedio: <strong>{p.promedio ?? 'Sin datos'}</strong> / 5</p>}
              {p.tipo === 'si_no' && <p>Sí: <strong>{p.si}</strong> · No: <strong>{p.no}</strong></p>}
              {p.tipo === 'texto_libre' && (
                <ul className="simple-list">
                  {p.respuestas.map((r, i) => <li key={i}>“{r}”</li>)}
                  {p.respuestas.length === 0 && <li style={{ color: 'var(--text-muted)' }}>Sin respuestas aún.</li>}
                </ul>
              )}
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
