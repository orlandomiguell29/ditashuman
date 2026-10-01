import { useEffect, useRef, useState } from 'react';
import api from '../api/axiosClient';
import Modal from './Modal';
import { IconDownload, IconTrash, IconPlus } from './icons';

const HC_FORM_VACIO = {
  motivoConsulta: '',
  resumenSesion: '',
  analisisDiagnostico: '',
  planIntervencion: '',
  recomendaciones: '',
  nivelRiesgo: 'ninguno',
  proximaCitaRecomendada: '',
};

const NIVEL_RIESGO_ETIQUETA = { ninguno: 'Ninguno', bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };

// "Plantillas por tipo de consulta": DITASH agrupa a sus especialistas en
// categorías muy distintas (psicología/terapia, coaching, imagen personal,
// SST, etc.) bajo un mismo módulo de "historia clínica". En vez de un motor
// de formularios configurable (que exigiría definir campo por campo para
// cada categoría sin una necesidad concreta todavía), esto adapta solo las
// ETIQUETAS y el título del nivel de riesgo según la categoría del
// especialista que abre el modal — los campos y la base de datos son los
// mismos para todos, así que esto es puramente de presentación. Las
// categorías de salud/riesgo (bienestar emocional, SST) mantienen el marco
// clínico; las demás (coaching, imagen, desarrollo) usan un lenguaje de
// acompañamiento/consultoría, menos "médico", más acorde a lo que de verdad
// se diligencia ahí.
const PLANTILLA_POR_DEFECTO = {
  motivoConsulta: 'Motivo de consulta',
  resumenSesion: 'Resumen de la sesión',
  analisisDiagnostico: 'Análisis / impresión diagnóstica',
  planIntervencion: 'Plan de intervención',
  recomendaciones: 'Recomendaciones',
  nivelRiesgo: 'Nivel de riesgo percibido',
};
const PLANTILLAS_POR_CATEGORIA = {
  bienestar_emocional: PLANTILLA_POR_DEFECTO,
  sst: PLANTILLA_POR_DEFECTO,
  bienestar: PLANTILLA_POR_DEFECTO,
  coaching: {
    motivoConsulta: 'Motivo de la sesión',
    resumenSesion: 'Resumen de la sesión',
    analisisDiagnostico: 'Observaciones sobre la situación',
    planIntervencion: 'Plan de acción',
    recomendaciones: 'Recomendaciones de seguimiento',
    nivelRiesgo: 'Prioridad de seguimiento',
  },
  imagen: {
    motivoConsulta: 'Motivo de la asesoría',
    resumenSesion: 'Resumen de la sesión',
    analisisDiagnostico: 'Diagnóstico de imagen / situación actual',
    planIntervencion: 'Plan de acción',
    recomendaciones: 'Recomendaciones',
    nivelRiesgo: 'Prioridad de seguimiento',
  },
  desarrollo: {
    motivoConsulta: 'Motivo de la asesoría',
    resumenSesion: 'Resumen de la sesión',
    analisisDiagnostico: 'Observaciones sobre el caso',
    planIntervencion: 'Plan de acción',
    recomendaciones: 'Recomendaciones de seguimiento',
    nivelRiesgo: 'Prioridad de seguimiento',
  },
};

function formatearTamano(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Modal de Historia Clínica, extraído de especialista/Agenda.jsx para poder
// abrirse también desde el nuevo menú "Historial Clínico" (que navega por
// paciente en vez de por cita) sin duplicar ~150 líneas de lógica en dos
// archivos. Recibe la `cita` sobre la que se abre (debe traer su propio
// Colaborador->Usuario) y un `onClose`; todo lo demás es autónomo.
export default function HistoriaClinicaModal({ cita, onClose }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [form, setForm] = useState(HC_FORM_VACIO);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const inputArchivoRef = useRef(null);

  // "sucio" = hay cambios sin guardar desde la última carga/guardado — solo
  // dispara el autoguardado cuando de verdad hay algo nuevo que guardar, no
  // en cada render ni justo después de cargar los datos del servidor.
  const [sucio, setSucio] = useState(false);
  const timerAutoguardado = useRef(null);
  const mensajeTimer = useRef(null);

  function cargarDatos() {
    let cancelado = false;
    setError('');
    setCargando(true);
    api
      .get(`/especialista/citas/${cita.id}/historia-clinica`)
      .then(({ data: res }) => {
        if (cancelado) return;
        setDatos(res.data);
        const hc = res.data.historiaClinica;
        if (hc) {
          setForm({
            motivoConsulta: hc.motivo_consulta || '',
            resumenSesion: hc.resumen_sesion || '',
            analisisDiagnostico: hc.analisis_diagnostico || '',
            planIntervencion: hc.plan_intervencion || '',
            recomendaciones: hc.recomendaciones || '',
            nivelRiesgo: hc.nivel_riesgo || 'ninguno',
            proximaCitaRecomendada: hc.proxima_cita_recomendada || '',
          });
        }
      })
      .catch((err) => {
        if (!cancelado) setError(err.response?.data?.error || 'No fue posible cargar la historia clínica.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }

  useEffect(() => {
    setDatos(null);
    setForm(HC_FORM_VACIO);
    setSucio(false);
    const cancelar = cargarDatos();
    return () => {
      cancelar();
      clearTimeout(timerAutoguardado.current);
      clearTimeout(mensajeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cita.id]);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setSucio(true);
  }

  async function guardar(estado, { silencioso = false } = {}) {
    if (estado === 'finalizada' && !window.confirm('Una vez finalizada, esta historia clínica queda bloqueada y no podrás editarla. ¿Finalizar de todas formas?')) {
      return;
    }
    setError('');
    setGuardando(true);
    try {
      const { data: res } = await api.put(`/especialista/citas/${cita.id}/historia-clinica`, {
        ...form,
        proximaCitaRecomendada: form.proximaCitaRecomendada || null,
        estado,
      });
      setDatos((prev) => ({ ...prev, historiaClinica: { ...prev.historiaClinica, ...res.data } }));
      setSucio(false);
      if (estado === 'finalizada') {
        onClose();
        return;
      }
      clearTimeout(mensajeTimer.current);
      setMensaje(silencioso ? 'Guardado automático.' : 'Borrador guardado correctamente.');
      mensajeTimer.current = setTimeout(() => setMensaje(''), 4000);
    } catch (err) {
      // Un fallo de autoguardado no debe sentirse como un error bloqueante
      // (el especialista puede seguir escribiendo); solo se avisa fuerte si
      // fue un guardado manual.
      if (!silencioso) setError(err.response?.data?.error || 'No fue posible guardar la historia clínica.');
    } finally {
      setGuardando(false);
    }
  }

  // Autoguardado: 3 segundos después de la última tecla, siempre que haya
  // cambios sin guardar, no esté ya guardando, y la nota siga en borrador
  // (una finalizada/anulada no vuelve a escribirse). Evita perder lo
  // escrito si el especialista cierra el modal o se distrae sin darle a
  // "Guardar".
  useEffect(() => {
    if (!sucio || cargando || guardando) return undefined;
    if (datos?.historiaClinica?.estado && datos.historiaClinica.estado !== 'borrador') return undefined;
    clearTimeout(timerAutoguardado.current);
    timerAutoguardado.current = setTimeout(() => {
      guardar('borrador', { silencioso: true });
    }, 3000);
    return () => clearTimeout(timerAutoguardado.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, sucio]);

  async function descargarPdf() {
    setError('');
    setDescargandoPdf(true);
    try {
      const { data: blob } = await api.get(`/especialista/citas/${cita.id}/historia-clinica/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `historia-clinica-cita-${cita.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible descargar el PDF de la historia clínica.');
    } finally {
      setDescargandoPdf(false);
    }
  }

  async function subirAdjunto(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError('');
    setSubiendoAdjunto(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      await api.post(`/especialista/citas/${cita.id}/historia-clinica/adjuntos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible subir el adjunto.');
    } finally {
      setSubiendoAdjunto(false);
    }
  }

  async function descargarAdjunto(adjunto) {
    try {
      const { data: blob } = await api.get(`/especialista/citas/${cita.id}/historia-clinica/adjuntos/${adjunto.id}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = adjunto.nombre_original;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible descargar el adjunto.');
    }
  }

  async function eliminarAdjunto(adjunto) {
    if (!window.confirm(`¿Quitar el adjunto "${adjunto.nombre_original}"?`)) return;
    try {
      await api.delete(`/especialista/citas/${cita.id}/historia-clinica/adjuntos/${adjunto.id}`);
      cargarDatos();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible quitar el adjunto.');
    }
  }

  const hc = datos?.historiaClinica;
  const estadoHc = hc?.estado;
  const soloLectura = estadoHc === 'finalizada' || estadoHc === 'anulada';
  const esBorrador = !hc || estadoHc === 'borrador';
  const plantilla = PLANTILLAS_POR_CATEGORIA[datos?.especialistaCategoria] || PLANTILLA_POR_DEFECTO;
  const adjuntos = hc?.HistoriaClinicaAdjuntos || [];

  return (
    <Modal titulo={`Historia clínica — ${cita.Colaborador?.Usuario?.nombre || 'Paciente'}`} onClose={onClose}>
      {error && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}
      {cargando && <p>Cargando…</p>}
      {!cargando && datos && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span>
              Cita del {new Date(cita.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
              {estadoHc === 'finalizada' && (
                <> · <strong style={{ color: 'var(--exito, green)' }}>Finalizada el {new Date(hc.finalizada_en).toLocaleDateString('es-CO')}</strong></>
              )}
              {estadoHc === 'anulada' && (
                <> · <strong style={{ color: '#991b1b' }}>Anulada el {new Date(hc.anulada_en).toLocaleDateString('es-CO')}</strong></>
              )}
              {esBorrador && guardando && <> · <span style={{ color: 'var(--text-muted)' }}>Guardando…</span></>}
            </span>
            {hc && (
              <button type="button" className="btn-export" disabled={descargandoPdf} onClick={descargarPdf}>
                <IconDownload /> {descargandoPdf ? 'Generando…' : 'Descargar PDF'}
              </button>
            )}
          </p>

          {estadoHc === 'anulada' && (
            <div className="alert-error" style={{ marginTop: 10 }}>
              Esta historia clínica fue anulada por un administrador y quedó de solo lectura.
              {hc.anulada_motivo && <> Motivo: {hc.anulada_motivo}</>}
            </div>
          )}

          {soloLectura ? (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>{plantilla.motivoConsulta}</label>
              <p>{form.motivoConsulta || '—'}</p>
              <label>{plantilla.resumenSesion}</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{form.resumenSesion || '—'}</p>
              <label>{plantilla.analisisDiagnostico}</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{form.analisisDiagnostico || '—'}</p>
              <label>{plantilla.planIntervencion}</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{form.planIntervencion || '—'}</p>
              <label>{plantilla.recomendaciones}</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{form.recomendaciones || '—'}</p>
              <label>{plantilla.nivelRiesgo}</label>
              <p>{NIVEL_RIESGO_ETIQUETA[form.nivelRiesgo] || form.nivelRiesgo}</p>
            </div>
          ) : (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>{plantilla.motivoConsulta}</label>
              <input type="text" maxLength={500} value={form.motivoConsulta} onChange={(e) => actualizarCampo('motivoConsulta', e.target.value)} />
              <label>{plantilla.resumenSesion}</label>
              <textarea rows={4} value={form.resumenSesion} onChange={(e) => actualizarCampo('resumenSesion', e.target.value)} />
              <label>{plantilla.analisisDiagnostico}</label>
              <textarea rows={3} value={form.analisisDiagnostico} onChange={(e) => actualizarCampo('analisisDiagnostico', e.target.value)} />
              <label>{plantilla.planIntervencion}</label>
              <textarea rows={3} value={form.planIntervencion} onChange={(e) => actualizarCampo('planIntervencion', e.target.value)} />
              <label>{plantilla.recomendaciones}</label>
              <textarea rows={3} value={form.recomendaciones} onChange={(e) => actualizarCampo('recomendaciones', e.target.value)} />
              <label>{plantilla.nivelRiesgo}</label>
              <select value={form.nivelRiesgo} onChange={(e) => actualizarCampo('nivelRiesgo', e.target.value)}>
                <option value="ninguno">Ninguno</option>
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
              </select>
              <label>Próxima cita recomendada (opcional)</label>
              <input type="date" value={form.proximaCitaRecomendada || ''} onChange={(e) => actualizarCampo('proximaCitaRecomendada', e.target.value)} />

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" disabled={guardando} onClick={() => guardar('borrador')}>
                  {guardando ? 'Guardando…' : 'Guardar borrador'}
                </button>
                <button type="button" className="btn-primary" disabled={guardando} onClick={() => guardar('finalizada')}>
                  {guardando ? 'Guardando…' : 'Finalizar historia clínica'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Se guarda solo cada pocos segundos mientras escribes (autoguardado), y puedes guardar como borrador cuantas veces quieras — incluso durante la videollamada. Al finalizar, queda bloqueada para edición.
              </p>
            </div>
          )}

          {hc && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--gray-border)', paddingTop: 14 }}>
              <h4 style={{ marginBottom: 8 }}>Adjuntos</h4>
              {adjuntos.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin archivos adjuntos.</p>}
              {adjuntos.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <button type="button" onClick={() => descargarAdjunto(a)} style={{ background: 'none', border: 'none', color: 'var(--primary, #1d4ed8)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    {a.nombre_original}
                  </button>
                  <span style={{ color: 'var(--text-muted)' }}>({formatearTamano(a.tamano_bytes)})</span>
                  {esBorrador && (
                    <button type="button" className="btn-icon-only btn-danger" data-tooltip="Quitar adjunto" onClick={() => eliminarAdjunto(a)} style={{ marginLeft: 'auto' }}>
                      <IconTrash />
                    </button>
                  )}
                </div>
              ))}
              {esBorrador && (
                <div style={{ marginTop: 8 }}>
                  <input ref={inputArchivoRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={subirAdjunto} />
                  <button type="button" className="btn-secondary" disabled={subiendoAdjunto} onClick={() => inputArchivoRef.current?.click()}>
                    <IconPlus /> {subiendoAdjunto ? 'Subiendo…' : 'Adjuntar archivo (PDF, PNG o JPG)'}
                  </button>
                </div>
              )}
            </div>
          )}

          {datos.historialPrevio?.length > 0 && (
            <div style={{ marginTop: 24, borderTop: '1px solid var(--gray-border)', paddingTop: 14 }}>
              <h4 style={{ marginBottom: 8 }}>Historial previo con este paciente</h4>
              {datos.historialPrevio.map((h) => (
                <div key={h.id} style={{ marginBottom: 12, fontSize: 13 }}>
                  <strong>{h.Cita?.fecha_hora ? new Date(h.Cita.fecha_hora).toLocaleDateString('es-CO') : ''}</strong>
                  {h.motivo_consulta && <span> — {h.motivo_consulta}</span>}
                  {h.analisis_diagnostico && <p style={{ color: 'var(--text-muted)', margin: '2px 0 0' }}>{h.analisis_diagnostico}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
