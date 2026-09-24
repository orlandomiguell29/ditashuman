import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axiosClient';
import Modal from '../../components/Modal';
import EnlaceReunion from '../../components/EnlaceReunion';
import { IconBan, IconRefresh } from '../../components/icons';
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

function manana() {
  const f = new Date();
  f.setDate(f.getDate() + 1);
  return f.toISOString().slice(0, 10);
}

// La duración de la asesoría ya no es fija: es parametrizable por
// especialista desde Admin > Especialistas (Especialista.duracion_minutos)
// y cada cita guarda su propia duración (`cita.duracion_min`) al
// agendarse. El enlace de videollamada se mantiene activo desde que se
// agenda hasta esa cantidad de minutos después de la hora de inicio (la
// "hora límite de la reunión") — ver `reunionVigente` más abajo.
const DURACION_CITA_MINUTOS_POR_DEFECTO = 60;

// Igual que HORAS_MINIMAS_GESTIONAR_COLABORADOR en el backend
// (colaboradorController.js) — el backend es quien de verdad lo exige (tanto
// para cancelar como para reasignar); este valor solo se usa para no
// mostrar los botones cuando de todas formas el servidor los va a rechazar.
const HORAS_MINIMAS_GESTIONAR = 24;

export default function ColaboradorAgenda() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Cuando se llega desde "Hablar con un experto" (Categorias.jsx), la URL
  // trae `categoriaId`: la lista de especialistas queda filtrada a esa
  // categoría en vez de mostrar el marketplace completo. Es lo que hace
  // que este flujo sea genuinamente distinto de "Agendar asesoría" (sin
  // filtro, acceso directo).
  const categoriaId = searchParams.get('categoriaId');
  const categoriaTitulo = searchParams.get('categoriaTitulo');
  const [especialistas, setEspecialistas] = useState([]);
  const [misCitas, setMisCitas] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  // Selector real de horario: al elegir "Ver horarios", se abre un modal
  // con la fecha y los slots libres calculados por el backend a partir de
  // la franja semanal del especialista y sus citas ya reservadas — ya no
  // se agenda un horario fijo "mañana 10am" a ciegas.
  const [especialistaSeleccionado, setEspecialistaSeleccionado] = useState(null);
  const [fecha, setFecha] = useState(manana());
  const [slots, setSlots] = useState([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [enviandoCita, setEnviandoCita] = useState(false);
  const [canal, setCanal] = useState('videollamada_interna');
  const [googleConectado, setGoogleConectado] = useState(false);
  // Cuando no es null, el modal de horarios está en modo "reasignar" esta
  // cita existente (en vez de agendar una nueva) — reutiliza el mismo
  // selector de fecha/hora que ya trae el flujo de agendamiento.
  const [citaReagendando, setCitaReagendando] = useState(null);

  // Paginación de "Mis próximas citas" (en el cliente, ya que el backend
  // trae siempre el historial completo del colaborador): antes se
  // mostraban todas las citas de una vez, una lista que solo crece con el
  // tiempo.
  const paginacionCitas = usePaginacion({ clave: 'colaborador-agenda-citas' });

  function cargar() {
    api
      .get('/colaborador/especialistas', { params: categoriaId ? { categoriaId } : {} })
      .then((res) => setEspecialistas(res.data.data))
      .catch(() => {});
    api.get('/colaborador/citas').then((res) => setMisCitas(res.data.data)).catch(() => {});
    api.get('/admin/integraciones/google/disponible').then((res) => setGoogleConectado(res.data.data.disponible)).catch(() => setGoogleConectado(false));
  }

  useEffect(cargar, [categoriaId]);

  function quitarFiltro() {
    setSearchParams({});
  }

  function abrirSelector(esp) {
    setCitaReagendando(null);
    setEspecialistaSeleccionado(esp);
    setFecha(manana());
    // Google Meet es el canal por defecto cuando hay una cuenta conectada
    // (mejor experiencia: enlace real de Meet en vez de Jitsi). Si no hay
    // conexión, cae a Jitsi porque la opción de Meet aparece deshabilitada.
    setCanal(googleConectado ? 'meet' : 'videollamada_interna');
    setError('');
  }

  // Reasignar reutiliza el mismo modal de "ver horarios disponibles" que
  // agendar una cita nueva, pero contra el especialista YA asignado a esta
  // cita, y al elegir una hora llama a reagendar en vez de crear una cita.
  function abrirReagendar(cita) {
    setCitaReagendando(cita);
    setEspecialistaSeleccionado({ id: cita.especialista_id, Usuario: cita.Especialista?.Usuario });
    setFecha(manana());
    setError('');
  }

  useEffect(() => {
    if (!especialistaSeleccionado) return;
    setCargandoSlots(true);
    api
      .get(`/colaborador/especialistas/${especialistaSeleccionado.id}/horarios`, { params: { fecha } })
      .then((res) => setSlots(res.data.data))
      .catch(() => setSlots([]))
      .finally(() => setCargandoSlots(false));
  }, [especialistaSeleccionado, fecha]);

  async function agendar(hora) {
    // Sin este guard, dos clics seguidos sobre el mismo horario (doble clic,
    // o un clic mientras la petición anterior todavía viaja por la red)
    // disparaban dos POST /colaborador/citas casi simultáneos: ambos pasaban
    // la validación de solapamiento en el backend porque ninguno de los dos
    // había terminado de guardarse todavía cuando el otro la revisó, y el
    // resultado eran dos citas duplicadas en el mismo horario.
    if (enviandoCita) return;
    setEnviandoCita(true);
    setError('');
    setMensaje('');
    const fechaHora = new Date(`${fecha}T${hora}:00`);
    try {
      if (citaReagendando) {
        await api.patch(`/colaborador/citas/${citaReagendando.id}/reagendar`, { fechaHora: fechaHora.toISOString() });
        setMensaje('Cita reasignada. Quedó pendiente de que el especialista la confirme para la nueva fecha.');
      } else {
        await api.post('/colaborador/citas', {
          especialistaId: especialistaSeleccionado.id,
          fechaHora: fechaHora.toISOString(),
          motivo: 'Agendado desde el portal',
          canal,
        });
        setMensaje('Cita agendada correctamente.');
      }
      setEspecialistaSeleccionado(null);
      setCitaReagendando(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || (citaReagendando ? 'No fue posible reasignar la cita.' : 'No fue posible agendar la cita.'));
    } finally {
      setEnviandoCita(false);
    }
  }

  async function cancelar(citaId) {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    setError('');
    try {
      await api.patch(`/colaborador/citas/${citaId}/cancelar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible cancelar la cita.');
    }
  }

  const horasParaLaCita = (c) => (new Date(c.fecha_hora).getTime() - Date.now()) / (60 * 60 * 1000);
  // Cancelar y reasignar comparten la misma ventana mínima de 24 horas
  // (antes cancelar solo exigía que la cita fuera futura, lo que dejaba
  // cancelar literalmente minutos antes de que empezara).
  const puedeCancelarse = (c) => ['pendiente', 'confirmada'].includes(c.estado) && horasParaLaCita(c) >= HORAS_MINIMAS_GESTIONAR;
  const puedeReasignarse = (c) => ['pendiente', 'confirmada'].includes(c.estado) && horasParaLaCita(c) >= HORAS_MINIMAS_GESTIONAR;
  // El enlace de videollamada se mantiene habilitado desde que se agenda
  // hasta la hora límite de la reunión (inicio + duración real de esa
  // cita) — antes no tenía corte y quedaba "activo" para siempre, incluso
  // días después.
  const reunionVigente = (c) => {
    const duracion = c.duracion_min || DURACION_CITA_MINUTOS_POR_DEFECTO;
    return Date.now() <= new Date(c.fecha_hora).getTime() + duracion * 60 * 1000;
  };

  return (
    <div>
      <h2>Agendamiento de Citas Premium (Convenio Empresa)</h2>
      {categoriaId && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          Mostrando especialistas de <strong>{categoriaTitulo || 'esta categoría'}</strong>.
          <button type="button" className="btn-link" style={{ fontSize: 13 }} onClick={quitarFiltro}>Ver todos los especialistas</button>
        </p>
      )}
      {error && !especialistaSeleccionado && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="specialists-grid">
        {especialistas.map((esp) => (
          <div key={esp.id} className="esp-card">
            <h4>{esp.Usuario?.nombre}</h4>
            <p className="role">{esp.especialidad}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-6px 0 8px' }}>
              Sesiones de {esp.duracion_minutos || DURACION_CITA_MINUTOS_POR_DEFECTO} min
            </p>
            <div className="pricing-box">
              <span>Tarifa: <s>${Number(esp.tarifa_base).toLocaleString('es-CO')}</s></span>
              <span className="co-pay">
                Tú pagas aprox.: <strong>${Math.round(Number(esp.tarifa_base) * 0.3333).toLocaleString('es-CO')}</strong>
              </span>
              <small>Convenio Empresa cubre el restante</small>
            </div>
            <button className="btn-primary" onClick={() => abrirSelector(esp)}>Ver Horarios Disponibles</button>
          </div>
        ))}
        {especialistas.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>
            {categoriaId
              ? 'No hay especialistas verificados en esta categoría todavía.'
              : 'No hay especialistas disponibles en este momento.'}{' '}
            {categoriaId && <button type="button" className="btn-link" onClick={quitarFiltro}>Ver todos los especialistas</button>}
          </p>
        )}
      </div>

      <h2 style={{ marginTop: 40 }}>Mis próximas citas</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        💡 Puedes cancelar o reasignar una cita a otra fecha u hora hasta con {HORAS_MINIMAS_GESTIONAR} horas de anticipación. Con menos
        tiempo, contacta directamente al especialista.
      </p>
      {misCitas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aún no tienes citas agendadas.</p>}
      <div className="citas-lista">
        {misCitas
          .slice((paginacionCitas.pagina - 1) * paginacionCitas.tamanoPagina, paginacionCitas.pagina * paginacionCitas.tamanoPagina)
          .map((c) => {
          const activa = ['pendiente', 'confirmada'].includes(c.estado);
          const sinTiempoParaGestionar = activa && new Date(c.fecha_hora) > new Date() && horasParaLaCita(c) < HORAS_MINIMAS_GESTIONAR;
          const fecha = new Date(c.fecha_hora);
          return (
          <div key={c.id} className={`cita-card ${activa ? '' : 'cita-card-inactiva'}`}>
            <div className="cita-card-fechahora">
              <span className="cita-card-dia">{fecha.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
              <span className="cita-card-hora">{fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="cita-card-info">
              <div className="cita-card-encabezado">
                <strong>{c.Especialista?.Usuario?.nombre || 'Especialista'}</strong>
                <EstadoBadge variante={VARIANTE_ESTADO_CITA[c.estado] || 'neutro'}>{ETIQUETA_ESTADO_CITA[c.estado] || c.estado}</EstadoBadge>
              </div>
              <div className="cita-card-meta">
                {c.enlace_reunion && activa && reunionVigente(c) && <EnlaceReunion url={c.enlace_reunion} />}
                {c.enlace_reunion && activa && !reunionVigente(c) && <span>La reunión ya finalizó</span>}
                {sinTiempoParaGestionar && <span>Faltan menos de {HORAS_MINIMAS_GESTIONAR}h: ya no se puede cancelar ni reasignar aquí</span>}
              </div>
            </div>
            <div className="cita-card-acciones">
              {puedeReasignarse(c) && (
                <button className="btn-icon-only" data-tooltip="Reasignar a otra fecha/hora" onClick={() => abrirReagendar(c)}>
                  <IconRefresh />
                </button>
              )}
              {puedeCancelarse(c) && (
                <button className="btn-icon-only btn-danger" data-tooltip="Cancelar" onClick={() => cancelar(c.id)}>
                  <IconBan />
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>
      <Paginator
        page={paginacionCitas.pagina}
        totalItems={misCitas.length}
        pageSize={paginacionCitas.tamanoPagina}
        onPageChange={paginacionCitas.setPagina}
        onPageSizeChange={paginacionCitas.cambiarTamanoPagina}
      />

      {especialistaSeleccionado && (
        <Modal
          titulo={citaReagendando ? `Reasignar cita con ${especialistaSeleccionado.Usuario?.nombre}` : `Agendar con ${especialistaSeleccionado.Usuario?.nombre}`}
          onClose={() => { setEspecialistaSeleccionado(null); setCitaReagendando(null); }}
        >
          {error && <div className="alert-error">{error}</div>}
          {citaReagendando && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Elige la nueva fecha y hora. El especialista deberá confirmar la cita otra vez para el nuevo horario.
            </p>
          )}
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Fecha</label>
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            style={{ display: 'block', margin: '6px 0 16px', padding: 8, borderRadius: 6, border: '1px solid var(--gray-border)' }}
          />

          {!citaReagendando && (
            <>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Modalidad de videollamada</label>
              <div className="competencies-list" style={{ marginTop: 6, marginBottom: 16 }}>
                <label className="checkbox-label" title={googleConectado ? '' : 'Aún no hay una cuenta de Google conectada; contacta a tu administrador.'}>
                  <input
                    type="radio"
                    name="canal"
                    checked={canal === 'meet'}
                    disabled={!googleConectado}
                    onChange={() => setCanal('meet')}
                  />
                  Google Meet {!googleConectado && '(no disponible todavía)'}
                </label>
                <label className="checkbox-label">
                  <input type="radio" name="canal" checked={canal === 'videollamada_interna'} onChange={() => setCanal('videollamada_interna')} />
                  Videollamada DITASH (Jitsi)
                </label>
              </div>
            </>
          )}

          {cargandoSlots && <p>Buscando horarios…</p>}
          {!cargandoSlots && slots.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Sin horarios libres ese día. Prueba otra fecha.</p>}
          {!cargandoSlots && slots.length > 0 && (
            <div className="competencies-list">
              {slots.map((hora) => (
                <button key={hora} type="button" className="btn-xs" disabled={enviandoCita} onClick={() => agendar(hora)}>
                  {enviandoCita ? '...' : hora}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
