import { useEffect, useRef, useState } from 'react';
import api from '../../api/axiosClient';
import { IconDownload, IconTrash } from '../../components/icons';

export default function ColaboradorExpediente() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const fileInput = useRef(null);

  // Certificados de cursos completados: viven aquí (junto al resto de
  // documentos del expediente) en vez de en la tarjeta de cada curso en
  // Academia, que es donde antes se descargaban.
  const [certificados, setCertificados] = useState([]);
  const [descargandoCert, setDescargandoCert] = useState(null);

  function cargar() {
    api
      .get('/colaborador/expediente')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error || `No fue posible cargar el expediente (${err.response?.status || 'sin conexión'}).`));
    api
      .get('/colaborador/academia')
      .then((res) => {
        const inscripciones = res.data.data.inscripciones || [];
        const cursosPorId = new Map((res.data.data.cursos || []).map((c) => [c.id, c]));
        setCertificados(
          inscripciones
            .filter((i) => i.estado === 'completado' && i.certificado_url)
            .map((i) => ({ ...i, curso: cursosPorId.get(i.curso_id) }))
        );
      })
      .catch(() => {});
  }

  useEffect(cargar, []);

  async function descargarCertificado(inscripcionId) {
    setDescargandoCert(inscripcionId);
    setError('');
    try {
      const { data: pdf } = await api.get(`/colaborador/academia/inscripciones/${inscripcionId}/certificado`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `certificado-${inscripcionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible descargar el certificado.');
    } finally {
      setDescargandoCert(null);
    }
  }

  async function subirArchivo(e) {
    e.preventDefault();
    const archivo = fileInput.current.files[0];
    if (!archivo) return;

    const form = new FormData();
    form.append('archivo', archivo);
    form.append('tipo', 'hoja_vida');

    setSubiendo(true);
    setError('');
    try {
      await api.post('/colaborador/expediente/documentos', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      fileInput.current.value = '';
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  }

  // Descarga controlada: el backend revalida permisos en cada acceso y sirve
  // el binario (no hay URL pública), así que se pide como blob autenticado
  // en vez de un <a href> directo.
  async function descargar(doc) {
    setError('');
    try {
      const res = await api.get(`/colaborador/expediente/documentos/${doc.id}/descargar`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.nombre_original;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('No fue posible descargar el documento.');
    }
  }

  async function inactivar(doc) {
    if (!window.confirm(`¿Quitar "${doc.nombre_original}" de tu expediente? El archivo se conserva para auditoría, pero dejará de verse aquí.`)) return;
    setError('');
    try {
      await api.patch(`/colaborador/expediente/documentos/${doc.id}/inactivar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible quitar el documento.');
    }
  }

  if (error && !data) return <div className="alert-error">{error}</div>;
  if (!data) return <p>Cargando expediente…</p>;

  return (
    <div>
      <h2>Expediente Digital del Colaborador</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="expediente-container">
        <div className="exp-section">
          <h3>Documentación Base</h3>
          <ul className="simple-list">
            {data.documentos.map((d) => (
              <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  {d.nombre_original} {d.verificado && <span className="tag">Verificado</span>}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-icon-only" data-tooltip="Descargar" onClick={() => descargar(d)}>
                    <IconDownload />
                  </button>
                  <button className="btn-icon-only btn-danger" data-tooltip="Quitar" onClick={() => inactivar(d)}>
                    <IconTrash />
                  </button>
                </span>
              </li>
            ))}
            {data.documentos.length === 0 && <li style={{ color: 'var(--text-muted)' }}>Aún no has subido documentos.</li>}
          </ul>
          <form onSubmit={subirArchivo} style={{ marginTop: 15 }}>
            <input type="file" ref={fileInput} accept=".pdf,.png,.jpg,.jpeg" required />
            <button className="btn-secondary" type="submit" disabled={subiendo} style={{ marginTop: 10 }}>
              {subiendo ? 'Subiendo…' : 'Subir documento'}
            </button>
          </form>
        </div>

        <div className="exp-section">
          <h3>Certificados obtenidos</h3>
          <ul className="simple-list">
            {certificados.map((c) => (
              <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{c.curso?.titulo || 'Curso'}</span>
                <button
                  type="button"
                  className="btn-icon-only"
                  data-tooltip={descargandoCert === c.id ? 'Generando PDF…' : 'Descargar certificado (PDF)'}
                  disabled={descargandoCert === c.id}
                  onClick={() => descargarCertificado(c.id)}
                >
                  <IconDownload />
                </button>
              </li>
            ))}
            {certificados.length === 0 && <li style={{ color: 'var(--text-muted)' }}>Aún no has completado cursos con certificado.</li>}
          </ul>
        </div>

        <div className="exp-section">
          <h3>Mi Plan Individual de Desarrollo (PID)</h3>
          <ul className="simple-list">
            {(data.planDesarrollo || []).map((p) => (
              <li key={p.id}>
                Gap detectado: <strong>{p.gap_detectado}</strong>
                {p.Curso ? (
                  <> — RRHH te recomendó el curso <strong>{p.Curso.titulo}</strong> (disponible en Academia Virtual)</>
                ) : (
                  <> — RRHH aún no te ha asignado un curso para este punto</>
                )}
                {' · Estado: '}
                {{ sugerido: 'Sugerido', en_progreso: 'En progreso', completado: 'Completado' }[p.estado] || p.estado}
              </li>
            ))}
            {(!data.planDesarrollo || data.planDesarrollo.length === 0) && (
              <li style={{ color: 'var(--text-muted)' }}>No tienes acciones de desarrollo pendientes por ahora.</li>
            )}
          </ul>
        </div>

        <div className="exp-section">
          <h3>Objetivos del Periodo (OKRs)</h3>
          <ul className="simple-list">
            {data.okrs.map((o) => (
              <li key={o.id}>{o.descripcion} — {o.progreso_pct}%</li>
            ))}
            {data.okrs.length === 0 && <li style={{ color: 'var(--text-muted)' }}>RRHH aún no ha definido OKRs para este periodo.</li>}
          </ul>
        </div>

        <div className="exp-section">
          <h3>Historial de Asesorías</h3>
          <ul className="simple-list">
            {data.historialAsesorias.map((a) => (
              <li key={a.id}>
                <strong>{new Date(a.fecha_hora).toLocaleDateString('es-CO')}</strong> - {a.Especialista?.Usuario?.nombre} para {a.motivo}
              </li>
            ))}
            {data.historialAsesorias.length === 0 && <li style={{ color: 'var(--text-muted)' }}>Aún no tienes asesorías completadas.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
