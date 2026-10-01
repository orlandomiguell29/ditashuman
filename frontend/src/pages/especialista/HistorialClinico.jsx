import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axiosClient';
import HistoriaClinicaModal from '../../components/HistoriaClinicaModal';
import EstadoBadge from '../../components/EstadoBadge';
import { IconClipboardList, IconDownload } from '../../components/icons';

const VARIANTE_ESTADO_CITA = {
  pendiente: 'alerta',
  confirmada: 'info',
  completada: 'exito',
  cancelada: 'neutro',
  no_asistio: 'peligro',
};
const ETIQUETA_ESTADO_CITA = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

// Vista "por paciente" del mismo módulo de historia clínica que ya vive
// dentro de cada cita en Mi Agenda y Horarios — esta página reutiliza el
// mismo endpoint /especialista/agenda (ya trae todas las citas con el
// nombre del paciente) y solo las reagrupa por colaborador_id en el
// cliente, así no hace falta un endpoint nuevo en el backend para esto.
// Sirve para cuando el especialista quiere revisar/buscar el historial de
// un paciente puntual sin tener que ubicarlo primero entre todas sus citas.
export default function EspecialistaHistorialClinico() {
  const [citas, setCitas] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pacienteSeleccionadoId, setPacienteSeleccionadoId] = useState(null);
  const [citaParaHistoria, setCitaParaHistoria] = useState(null);
  const [descargandoConsolidado, setDescargandoConsolidado] = useState(false);
  const [errorConsolidado, setErrorConsolidado] = useState('');

  useEffect(() => {
    api
      .get('/especialista/agenda')
      .then((res) => setCitas(res.data.data.citas || []))
      .catch(() => setError('No fue posible cargar tus pacientes.'));
  }, []);

  // Agrupa las citas por paciente y ordena cada lista de más reciente a más
  // antigua; los pacientes se ordenan por su cita más reciente primero, así
  // los casos "activos" quedan arriba sin tener que buscarlos.
  const pacientes = useMemo(() => {
    if (!citas) return [];
    const porPaciente = new Map();
    for (const c of citas) {
      const id = c.colaborador_id;
      if (!porPaciente.has(id)) {
        porPaciente.set(id, {
          id,
          nombre: c.Colaborador?.Usuario?.nombre || 'Paciente',
          citas: [],
        });
      }
      porPaciente.get(id).citas.push(c);
    }
    const lista = Array.from(porPaciente.values());
    for (const p of lista) {
      p.citas.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
    }
    lista.sort((a, b) => new Date(b.citas[0].fecha_hora) - new Date(a.citas[0].fecha_hora));
    return lista;
  }, [citas]);

  const pacientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [pacientes, busqueda]);

  const pacienteSeleccionado = pacientes.find((p) => p.id === pacienteSeleccionadoId) || null;

  // Solo tiene sentido ofrecer el PDF consolidado si de verdad hay al menos
  // una sesión finalizada con este paciente (el backend lo rechaza con 404
  // si no hay ninguna) — se filtra aquí mismo para no mostrar un botón que
  // siempre falla.
  async function descargarHistorialConsolidado() {
    if (!pacienteSeleccionado) return;
    setErrorConsolidado('');
    setDescargandoConsolidado(true);
    try {
      const { data: blob } = await api.get(`/especialista/pacientes/${pacienteSeleccionado.id}/historial-pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `historial-clinico-${pacienteSeleccionado.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorConsolidado(err.response?.data?.error || 'No fue posible descargar el historial consolidado.');
    } finally {
      setDescargandoConsolidado(false);
    }
  }

  if (error) return <div className="alert-error">{error}</div>;
  if (!citas) return <p>Cargando…</p>;

  return (
    <div>
      <h2>Historial Clínico</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: -6, marginBottom: 18 }}>
        Busca un paciente para ver todas sus sesiones y diligenciar o consultar cada historia clínica.
      </p>

      {pacientes.length === 0 ? (
        <div className="pid-box">
          <p>Todavía no tienes pacientes con citas registradas.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="pid-box" style={{ flex: '1 1 280px', maxWidth: 340 }}>
            <input
              type="text"
              placeholder="Buscar paciente por nombre…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
              {pacientesFiltrados.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin resultados.</p>}
              {pacientesFiltrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPacienteSeleccionadoId(p.id)}
                  className="btn-secondary"
                  style={{
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    background: p.id === pacienteSeleccionadoId ? 'var(--primary-light, #eef2ff)' : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.citas.length} {p.citas.length === 1 ? 'cita' : 'citas'} · última el {new Date(p.citas[0].fecha_hora).toLocaleDateString('es-CO')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pid-box" style={{ flex: '2 1 420px' }}>
            {!pacienteSeleccionado ? (
              <p style={{ color: 'var(--text-muted)' }}>Selecciona un paciente de la lista para ver sus sesiones.</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>{pacienteSeleccionado.nombre}</h3>
                  <button type="button" className="btn-export" disabled={descargandoConsolidado} onClick={descargarHistorialConsolidado}>
                    <IconDownload /> {descargandoConsolidado ? 'Generando…' : 'Descargar historial completo (PDF)'}
                  </button>
                </div>
                {errorConsolidado && <div className="alert-error" style={{ marginTop: 10 }}>{errorConsolidado}</div>}
                <table className="data-table" style={{ marginTop: 14 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Historia clínica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pacienteSeleccionado.citas.map((c) => (
                      <tr key={c.id}>
                        <td>{new Date(c.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>
                          <EstadoBadge variante={VARIANTE_ESTADO_CITA[c.estado] || 'neutro'}>
                            {ETIQUETA_ESTADO_CITA[c.estado] || c.estado}
                          </EstadoBadge>
                        </td>
                        <td>
                          <button type="button" className="btn-icon-only" data-tooltip="Ver / diligenciar historia clínica" onClick={() => setCitaParaHistoria(c)}>
                            <IconClipboardList />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {citaParaHistoria && (
        <HistoriaClinicaModal cita={citaParaHistoria} onClose={() => setCitaParaHistoria(null)} />
      )}
    </div>
  );
}
