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
const ESTADO_HC = {
  borrador: { variante: 'alerta', texto: 'Nota en borrador' },
  finalizada: { variante: 'exito', texto: 'Nota finalizada' },
  anulada: { variante: 'peligro', texto: 'Nota anulada' },
};

function iniciales(nombre) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// Una descarga con responseType 'blob' recibe también los ERRORES como
// blob: sin esto, el mensaje real del backend (ej. "este paciente no tiene
// historias finalizadas") se perdía y solo se veía un texto genérico.
async function mensajeDeErrorBlob(err, porDefecto) {
  try {
    const data = err.response?.data;
    if (data instanceof Blob) {
      const json = JSON.parse(await data.text());
      return json.error || porDefecto;
    }
    return data?.error || porDefecto;
  } catch {
    return porDefecto;
  }
}

function IconBuscar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// Vista "por paciente" del módulo de historia clínica: lista de pacientes a
// la izquierda y ficha del paciente (resumen + todas sus sesiones, con el
// estado de la nota de cada una) a la derecha. Reutiliza /especialista/agenda
// (que ya trae cada cita con su paciente y el estado de su historia
// clínica) y solo reagrupa por colaborador en el cliente.
export default function EspecialistaHistorialClinico() {
  const [citas, setCitas] = useState(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pacienteSeleccionadoId, setPacienteSeleccionadoId] = useState(null);
  const [citaParaHistoria, setCitaParaHistoria] = useState(null);
  const [descargandoConsolidado, setDescargandoConsolidado] = useState(false);
  const [errorConsolidado, setErrorConsolidado] = useState('');

  function cargar() {
    api
      .get('/especialista/agenda')
      .then((res) => setCitas(res.data.data.citas || []))
      .catch(() => setError('No fue posible cargar tus pacientes.'));
  }
  useEffect(cargar, []);

  const pacientes = useMemo(() => {
    if (!citas) return [];
    const porPaciente = new Map();
    for (const c of citas) {
      const id = c.colaborador_id;
      if (!porPaciente.has(id)) {
        porPaciente.set(id, { id, nombre: c.Colaborador?.Usuario?.nombre || 'Paciente', citas: [] });
      }
      porPaciente.get(id).citas.push(c);
    }
    const lista = Array.from(porPaciente.values());
    for (const p of lista) {
      p.citas.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
      p.completadas = p.citas.filter((c) => c.estado === 'completada').length;
      p.notasFinalizadas = p.citas.filter((c) => c.HistoriaClinica?.estado === 'finalizada').length;
      p.notasBorrador = p.citas.filter((c) => c.HistoriaClinica?.estado === 'borrador').length;
    }
    lista.sort((a, b) => new Date(b.citas[0].fecha_hora) - new Date(a.citas[0].fecha_hora));
    return lista;
  }, [citas]);

  const pacientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [pacientes, busqueda]);

  const paciente = pacientes.find((p) => p.id === pacienteSeleccionadoId) || null;

  function seleccionar(id) {
    setPacienteSeleccionadoId(id);
    setErrorConsolidado('');
  }

  async function descargarHistorialConsolidado() {
    if (!paciente) return;
    setErrorConsolidado('');
    setDescargandoConsolidado(true);
    try {
      const { data: blob } = await api.get(`/especialista/pacientes/${paciente.id}/historial-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `historial-clinico-${paciente.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorConsolidado(await mensajeDeErrorBlob(err, 'No fue posible descargar el historial consolidado.'));
    } finally {
      setDescargandoConsolidado(false);
    }
  }

  function cerrarModal() {
    setCitaParaHistoria(null);
    cargar(); // refresca el estado de la nota (borrador/finalizada) en la ficha
  }

  if (error) return <div className="alert-error">{error}</div>;
  if (!citas) return <p>Cargando…</p>;

  return (
    <div>
      <h2>Historial Clínico</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Consulta la ficha de cada paciente, sus sesiones y el estado de cada historia clínica.
      </p>

      <div className="hc-layout">
        <aside className="hc-panel">
          <div className="hc-panel-header">
            <h3>Pacientes ({pacientes.length})</h3>
            <div className="hc-buscador">
              <IconBuscar />
              <input type="search" placeholder="Buscar por nombre…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
          {pacientes.length === 0 ? (
            <div className="hc-vacio">Todavía no tienes pacientes con citas registradas.</div>
          ) : (
            <ul className="hc-lista-pacientes">
              {pacientesFiltrados.length === 0 && <li className="hc-vacio" style={{ padding: 24 }}>Sin resultados para “{busqueda}”.</li>}
              {pacientesFiltrados.map((p) => (
                <li key={p.id}>
                  <button type="button" className={`hc-paciente${p.id === pacienteSeleccionadoId ? ' activo' : ''}`} onClick={() => seleccionar(p.id)}>
                    <span className="hc-avatar">{iniciales(p.nombre)}</span>
                    <span>
                      <span className="hc-paciente-nombre">{p.nombre}</span>
                      <span className="hc-paciente-meta" style={{ display: 'block' }}>
                        {p.citas.length} {p.citas.length === 1 ? 'cita' : 'citas'} · última {new Date(p.citas[0].fecha_hora).toLocaleDateString('es-CO')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="hc-panel">
          {!paciente ? (
            <div className="hc-vacio">
              <IconClipboardList />
              <p>Selecciona un paciente para ver su ficha y sus sesiones.</p>
            </div>
          ) : (
            <>
              <div className="hc-ficha-header">
                <span className="hc-avatar grande">{iniciales(paciente.nombre)}</span>
                <div>
                  <h3>{paciente.nombre}</h3>
                  <div className="hc-ficha-sub">Paciente desde {new Date(paciente.citas[paciente.citas.length - 1].fecha_hora).toLocaleDateString('es-CO', { dateStyle: 'long' })}</div>
                </div>
                <button
                  type="button"
                  className="btn-export"
                  disabled={descargandoConsolidado || paciente.notasFinalizadas === 0}
                  title={paciente.notasFinalizadas === 0 ? 'Disponible cuando el paciente tenga al menos una historia clínica finalizada' : undefined}
                  onClick={descargarHistorialConsolidado}
                >
                  <IconDownload /> {descargandoConsolidado ? 'Generando…' : 'Historial completo (PDF)'}
                </button>
              </div>

              <div className="hc-resumen">
                <div><span>Citas</span><strong>{paciente.citas.length}</strong></div>
                <div><span>Completadas</span><strong>{paciente.completadas}</strong></div>
                <div><span>Notas finalizadas</span><strong>{paciente.notasFinalizadas}</strong></div>
                <div><span>En borrador</span><strong>{paciente.notasBorrador}</strong></div>
              </div>

              {paciente.notasFinalizadas === 0 && (
                <p className="hc-aviso">
                  El historial completo en PDF se habilita cuando este paciente tenga al menos una historia clínica
                  <strong> finalizada</strong>. Abre una sesión con “Diligenciar”, completa la nota y pulsa “Finalizar historia clínica”.
                </p>
              )}
              {errorConsolidado && <div className="alert-error" style={{ margin: '14px 22px 0' }}>{errorConsolidado}</div>}

              <ul className="hc-sesiones">
                {paciente.citas.map((c) => {
                  const fecha = new Date(c.fecha_hora);
                  const hc = c.HistoriaClinica ? ESTADO_HC[c.HistoriaClinica.estado] : null;
                  return (
                    <li key={c.id} className="hc-sesion">
                      <div className="hc-sesion-fecha">
                        <strong>{fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                        <span>{fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="hc-sesion-estados">
                        <EstadoBadge variante={VARIANTE_ESTADO_CITA[c.estado] || 'neutro'}>{ETIQUETA_ESTADO_CITA[c.estado] || c.estado}</EstadoBadge>
                        {hc ? (
                          <EstadoBadge variante={hc.variante}>{hc.texto}</EstadoBadge>
                        ) : (
                          <span className="hc-sesion-nota">Sin historia clínica</span>
                        )}
                      </div>
                      <button type="button" className="btn-hc" onClick={() => setCitaParaHistoria(c)}>
                        <IconClipboardList /> {hc ? 'Ver historia' : 'Diligenciar'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {citaParaHistoria && <HistoriaClinicaModal cita={citaParaHistoria} onClose={cerrarModal} />}
    </div>
  );
}
