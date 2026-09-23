import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import EnlaceReunion from '../../components/EnlaceReunion';
import Modal from '../../components/Modal';
import { IconTrash, IconCheck, IconCheckCircle, IconBan, IconRefresh, IconEdit, IconDownload, IconX } from '../../components/icons';
import Paginator from '../../components/Paginator';
import { usePaginacion } from '../../hooks/usePaginacion';
import EstadoBadge from '../../components/EstadoBadge';

// Variante visual de EstadoBadge para cada estado posible de una cita —
// igual criterio de color en colaborador/Agenda.jsx y especialista/Agenda.jsx.
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

// La duración de la reunión ya no es un valor fijo: es parametrizable por
// especialista desde Admin > Especialistas (Especialista.duracion_minutos).
// Cada cita guarda su propia duración (`cita.duracion_min`) al agendarse,
// así que el corte del enlace de videollamada se calcula por cita, no con
// una constante global — ver `reunionVigente` más abajo.
const DURACION_CITA_MINUTOS_POR_DEFECTO = 60;

export default function EspecialistaAgenda() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [dia, setDia] = useState('1');
  const [inicio, setInicio] = useState('08:00');
  const [fin, setFin] = useState('12:00');
  // Cuando no es null, el formulario de arriba está editando esta franja
  // existente (en vez de crear una nueva) — reutiliza los mismos campos de
  // día/inicio/fin, pero llama a PUT en vez de POST al guardar. Antes solo
  // se podía crear o eliminar una franja; para "cambiarle la hora" había
  // que borrarla y crear una nueva.
  const [editandoHorarioId, setEditandoHorarioId] = useState(null);
  const [guardandoHorario, setGuardandoHorario] = useState(false);

  // Duración de cada cita (Especialista.duracion_minutos): antes solo un
  // administrador podía cambiarla desde Admin > Especialistas; el propio
  // especialista solo veía un texto fijo diciendo "contacta a tu
  // administrador". Ahora la puede ajustar aquí mismo, ya que es un
  // parámetro de su propia agenda.
  const [editandoDuracion, setEditandoDuracion] = useState(false);
  const [duracionMinutos, setDuracionMinutos] = useState('');
  const [guardandoDuracion, setGuardandoDuracion] = useState(false);

  // Filtro por rango de fechas de "Mis citas": filtra la tabla de abajo EN
  // VIVO (sin recargar) y, con los mismos valores, acota la exportación a
  // Excel — así lo que se exporta es exactamente lo que se está viendo.
  // Vacíos los dos = sin filtro, se ve/exporta todo.
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [exportando, setExportando] = useState(false);

  function restablecerFiltroFechas() {
    setFiltroFechaInicio('');
    setFiltroFechaFin('');
    paginacionCitas.setPagina(1);
  }

  // Reasignar una cita propia: a diferencia del colaborador, el especialista
  // no tiene restricción de 24 horas (administra su propia agenda), así
  // que aquí basta un selector simple de fecha/hora nueva.
  const [reagendando, setReagendando] = useState(null); // cita | null
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [guardandoReagendar, setGuardandoReagendar] = useState(false);

  // Paginación de "Mis citas" (en el cliente): la agenda de un especialista
  // activo crece indefinidamente con el historial de citas.
  const paginacionCitas = usePaginacion({ clave: 'especialista-agenda-citas' });

  function cargar() {
    api.get('/especialista/agenda').then((res) => setData(res.data.data)).catch(() => setError('No fue posible cargar tu agenda.'));
  }

  useEffect(cargar, []);
  // Si el filtro de fechas deja la página actual sin filas, vuelve a la 1
  // en vez de mostrar una página vacía.
  useEffect(() => {
    paginacionCitas.setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroFechaInicio, filtroFechaFin]);

  function iniciarEdicionHorario(h) {
    setError('');
    setEditandoHorarioId(h.id);
    setDia(String(h.dia_semana));
    setInicio(h.hora_inicio.slice(0, 5));
    setFin(h.hora_fin.slice(0, 5));
  }

  function cancelarEdicionHorario() {
    setEditandoHorarioId(null);
    setDia('1');
    setInicio('08:00');
    setFin('12:00');
  }

  async function guardarHorario(e) {
    e.preventDefault();
    setError('');
    setGuardandoHorario(true);
    try {
      const cuerpo = { diaSemana: Number(dia), horaInicio: inicio, horaFin: fin };
      if (editandoHorarioId) {
        await api.put(`/especialista/horarios/${editandoHorarioId}`, cuerpo);
      } else {
        await api.post('/especialista/horarios', cuerpo);
      }
      cancelarEdicionHorario();
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || (editandoHorarioId ? 'No fue posible guardar los cambios.' : 'No fue posible crear la ventana de atención.'));
    } finally {
      setGuardandoHorario(false);
    }
  }

  function iniciarEdicionDuracion() {
    setError('');
    setDuracionMinutos(String(data?.especialista?.duracion_minutos || DURACION_CITA_MINUTOS_POR_DEFECTO));
    setEditandoDuracion(true);
  }

  async function guardarDuracion(e) {
    e.preventDefault();
    setError('');
    setGuardandoDuracion(true);
    try {
      await api.patch('/especialista/duracion', { duracionMinutos: Number(duracionMinutos) });
      setEditandoDuracion(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible actualizar la duración de las citas.');
    } finally {
      setGuardandoDuracion(false);
    }
  }

  async function exportarCitas() {
    setError('');
    setExportando(true);
    try {
      const { data: blob } = await api.get('/especialista/citas/export', {
        params: {
          format: 'xlsx',
          fechaInicio: filtroFechaInicio || undefined,
          fechaFin: filtroFechaFin || undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mis_citas.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible exportar la agenda de citas.');
    } finally {
      setExportando(false);
    }
  }

  async function eliminarHorario(id) {
    if (!window.confirm('¿Eliminar esta franja horaria? Ya no se ofrecerá a los colaboradores.')) return;
    try {
      await api.delete(`/especialista/horarios/${id}`);
      if (editandoHorarioId === id) cancelarEdicionHorario();
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible eliminar la franja horaria.');
    }
  }

  async function confirmar(citaId) {
    try {
      await api.patch(`/especialista/citas/${citaId}/confirmar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible confirmar la cita.');
    }
  }

  async function cancelar(citaId) {
    if (!window.confirm('¿Cancelar esta cita? El colaborador verá que fue cancelada.')) return;
    try {
      await api.patch(`/especialista/citas/${citaId}/cancelar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible cancelar la cita.');
    }
  }

  async function completar(citaId) {
    try {
      await api.post(`/especialista/citas/${citaId}/completar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible completar la cita.');
    }
  }

  function abrirReagendar(cita) {
    setError('');
    setReagendando(cita);
    const f = new Date(cita.fecha_hora);
    setNuevaFecha(f.toISOString().slice(0, 10));
    setNuevaHora(f.toTimeString().slice(0, 5));
  }

  async function guardarReagendar(e) {
    e.preventDefault();
    setError('');
    setGuardandoReagendar(true);
    try {
      const fechaHora = new Date(`${nuevaFecha}T${nuevaHora}:00`);
      await api.patch(`/especialista/citas/${reagendando.id}/reagendar`, { fechaHora: fechaHora.toISOString() });
      setReagendando(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible reasignar la cita.');
    } finally {
      setGuardandoReagendar(false);
    }
  }

  // El enlace de videollamada se mantiene habilitado desde que se agenda
  // hasta la hora límite de la reunión (inicio + duración real de esa
  // cita) — antes no tenía corte y quedaba "activo" para siempre, incluso
  // días después.
  const reunionVigente = (c) => {
    const duracion = c.duracion_min || DURACION_CITA_MINUTOS_POR_DEFECTO;
    return Date.now() <= new Date(c.fecha_hora).getTime() + duracion * 60 * 1000;
  };

  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Mismo rango Desde/Hasta usado para exportar filtra también la tabla de
  // abajo, en el cliente (sin ir al backend): "Hasta" incluye el día
  // completo, no solo la medianoche. Vacíos los dos = se ve todo.
  const filtroFechasActivo = Boolean(filtroFechaInicio || filtroFechaFin);
  const citasFiltradas = (data?.citas || []).filter((c) => {
    if (!filtroFechasActivo) return true;
    const t = new Date(c.fecha_hora).getTime();
    if (filtroFechaInicio && t < new Date(`${filtroFechaInicio}T00:00:00`).getTime()) return false;
    if (filtroFechaFin && t > new Date(`${filtroFechaFin}T23:59:59`).getTime()) return false;
    return true;
  });

  return (
    <div>
      <h2>Portal del Experto / Especialista</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="pid-box">
        <h3>Definición de Agenda y Logística</h3>
        <p>Configure sus franjas horarias semanales. Las llamadas se sincronizan mediante salas integradas o redirección a Zoom/Teams/Meet.</p>
        {editandoDuracion ? (
          <form className="inline-form" onSubmit={guardarDuracion} style={{ marginTop: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Duración de cada cita (minutos):</label>
            <input
              type="number"
              min={15}
              max={240}
              required
              value={duracionMinutos}
              onChange={(e) => setDuracionMinutos(e.target.value)}
              style={{ width: 90 }}
            />
            <button className="btn-primary" type="submit" disabled={guardandoDuracion}>
              {guardandoDuracion ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditandoDuracion(false)}>Cancelar</button>
          </form>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Duración de cada cita: <strong>{data?.especialista?.duracion_minutos || DURACION_CITA_MINUTOS_POR_DEFECTO} minutos</strong>{' '}
            (los horarios ofrecidos al colaborador se dividen en bloques de este tamaño).{' '}
            <button type="button" className="btn-link" style={{ fontSize: 13 }} onClick={iniciarEdicionDuracion}>Cambiar</button>
          </p>
        )}
        {editandoHorarioId && (
          <p style={{ fontSize: 13, color: 'var(--primary)', marginTop: 15, marginBottom: -5 }}>
            ✏️ Editando franja existente — cambia día/hora y guarda, o{' '}
            <button type="button" className="btn-link" style={{ fontSize: 13 }} onClick={cancelarEdicionHorario}>cancela la edición</button>.
          </p>
        )}
        <form className="inline-form" onSubmit={guardarHorario} style={{ marginTop: 15 }}>
          <select value={dia} onChange={(e) => setDia(e.target.value)}>
            {DIAS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
          <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={guardandoHorario}>
            {guardandoHorario ? 'Guardando…' : editandoHorarioId ? 'Guardar cambios' : 'Crear Nueva Ventana de Atención'}
          </button>
          {editandoHorarioId && (
            <button type="button" className="btn-secondary" onClick={cancelarEdicionHorario}>Cancelar</button>
          )}
        </form>
      </div>

      <h3 style={{ marginTop: 30 }}>Mis franjas horarias</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: -8 }}>
        Vista semanal: cada columna es un día. Usa los íconos para editar o eliminar una franja.
      </p>
      <div className="horarios-grid">
        {DIAS.map((nombreDia, i) => {
          const franjasDelDia = (data?.horarios || [])
            .filter((h) => h.dia_semana === i)
            .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          return (
            <div key={i} className="horarios-grid-dia">
              <h4>{nombreDia}</h4>
              {franjasDelDia.length === 0 && <p className="horarios-grid-vacio">Sin franjas</p>}
              {franjasDelDia.map((h) => (
                <div key={h.id} className={`horarios-grid-franja ${editandoHorarioId === h.id ? 'horarios-grid-franja-activa' : ''}`}>
                  <span>{h.hora_inicio.slice(0, 5)} - {h.hora_fin.slice(0, 5)}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-icon-only" data-tooltip="Editar" onClick={() => iniciarEdicionHorario(h)}>
                      <IconEdit />
                    </button>
                    <button className="btn-icon-only btn-danger" data-tooltip="Eliminar" onClick={() => eliminarHorario(h.id)}>
                      <IconTrash />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 30 }}>Mis citas</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        💡 Puedes editar/reasignar cualquiera de tus citas a otra fecha u hora cuando lo necesites, sin restricción de anticipación.
      </p>
      <div className="filtro-rango-fecha">
        <div className="filtro-rango-fecha-campo">
          <label htmlFor="citas-desde">Desde</label>
          <input id="citas-desde" type="date" value={filtroFechaInicio} max={filtroFechaFin || undefined} onChange={(e) => setFiltroFechaInicio(e.target.value)} />
        </div>
        <div className="filtro-rango-fecha-campo">
          <label htmlFor="citas-hasta">Hasta</label>
          <input id="citas-hasta" type="date" value={filtroFechaFin} min={filtroFechaInicio || undefined} onChange={(e) => setFiltroFechaFin(e.target.value)} />
        </div>
        <div className="filtro-rango-fecha-acciones">
          {filtroFechasActivo && (
            <button type="button" className="btn-reset-filtro" onClick={restablecerFiltroFechas}>
              <IconX width={12} height={12} /> Restablecer
            </button>
          )}
          <button type="button" className="btn-export" onClick={exportarCitas} disabled={exportando}>
            <IconDownload width={14} height={14} />
            {exportando ? 'Exportando…' : 'Exportar Excel'}
          </button>
        </div>
        {filtroFechasActivo && (
          <p className="filtro-rango-fecha-resumen">
            Mostrando {citasFiltradas.length} de {data?.citas.length || 0} citas
            {filtroFechaInicio && ` desde ${new Date(`${filtroFechaInicio}T00:00:00`).toLocaleDateString('es-CO')}`}
            {filtroFechaFin && ` hasta ${new Date(`${filtroFechaFin}T00:00:00`).toLocaleDateString('es-CO')}`}
            . La exportación a Excel usa este mismo rango.
          </p>
        )}
      </div>
      {data?.citas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aún no tienes citas agendadas.</p>}
      {data?.citas.length > 0 && citasFiltradas.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No hay citas en el rango de fechas seleccionado.</p>
      )}
      <div className="citas-lista">
        {citasFiltradas
          .slice((paginacionCitas.pagina - 1) * paginacionCitas.tamanoPagina, paginacionCitas.pagina * paginacionCitas.tamanoPagina)
          .map((c) => {
            const activa = ['pendiente', 'confirmada'].includes(c.estado);
            const fecha = new Date(c.fecha_hora);
            return (
          <div key={c.id} className={`cita-card ${activa ? '' : 'cita-card-inactiva'}`}>
            <div className="cita-card-fechahora">
              <span className="cita-card-dia">{fecha.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
              <span className="cita-card-hora">{fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="cita-card-info">
              <div className="cita-card-encabezado">
                <strong>{c.Colaborador?.Usuario?.nombre || 'Colaborador'}</strong>
                <EstadoBadge variante={VARIANTE_ESTADO_CITA[c.estado] || 'neutro'}>{ETIQUETA_ESTADO_CITA[c.estado] || c.estado}</EstadoBadge>
              </div>
              <div className="cita-card-meta">
                {c.enlace_reunion && activa && reunionVigente(c) && <EnlaceReunion url={c.enlace_reunion} />}
                {c.enlace_reunion && activa && !reunionVigente(c) && <span>La reunión ya finalizó</span>}
              </div>
            </div>
            <div className="cita-card-acciones">
              {c.estado === 'pendiente' && (
                <button className="btn-icon-only" data-tooltip="Confirmar" onClick={() => confirmar(c.id)}>
                  <IconCheck />
                </button>
              )}
              {activa && (
                <>
                  <button className="btn-icon-only" data-tooltip="Editar / reasignar fecha y hora" onClick={() => abrirReagendar(c)}>
                    <IconRefresh />
                  </button>
                  <button className="btn-icon-only" data-tooltip="Marcar completada" onClick={() => completar(c.id)}>
                    <IconCheckCircle />
                  </button>
                  <button className="btn-icon-only btn-danger" data-tooltip="Cancelar" onClick={() => cancelar(c.id)}>
                    <IconBan />
                  </button>
                </>
              )}
              {/* Una cita pasa a "No asistió" sola cuando nadie la tocó a tiempo (ver
                  backend/src/utils/citas.js). Aun así el especialista puede corregirla
                  a mano si en realidad sí se realizó, por eso este botón queda visible
                  también en ese estado. */}
              {c.estado === 'no_asistio' && (
                <button className="btn-icon-only" data-tooltip="Marcar completada (corrección)" onClick={() => completar(c.id)}>
                  <IconCheckCircle />
                </button>
              )}
            </div>
          </div>
            );
          })}
      </div>
      <Paginator
        page={paginacionCitas.pagina}
        totalItems={citasFiltradas.length}
        pageSize={paginacionCitas.tamanoPagina}
        onPageChange={paginacionCitas.setPagina}
        onPageSizeChange={paginacionCitas.cambiarTamanoPagina}
      />

      {reagendando && (
        <Modal titulo={`Reasignar cita — ${reagendando.Colaborador?.Usuario?.nombre}`} onClose={() => setReagendando(null)}>
          <form onSubmit={guardarReagendar} className="form-grid">
            {error && <div className="alert-error">{error}</div>}
            <label>Nueva fecha</label>
            <input type="date" required min={new Date().toISOString().slice(0, 10)} value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
            <label>Nueva hora</label>
            <input type="time" required value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              La cita quedará "pendiente" otra vez para el nuevo horario y el colaborador verá el cambio.
            </p>
            <button className="btn-primary" type="submit" disabled={guardandoReagendar} style={{ marginTop: 10 }}>
              {guardandoReagendar ? 'Guardando…' : 'Guardar nueva fecha/hora'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
