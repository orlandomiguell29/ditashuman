import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import EstadoBadge from '../../components/EstadoBadge';
import { IconBan } from '../../components/icons';

const VARIANTE_ESTADO = { finalizada: 'exito', anulada: 'peligro' };
const ETIQUETA_ESTADO = { finalizada: 'Finalizada', anulada: 'Anulada' };

// Corrección administrativa de historias clínicas: exclusiva de
// SUPER_ADMIN (ver historiasClinicasAdminRoutes.js en el backend — ningún
// ADMIN_EMPRESA, ni siquiera RRHH de la empresa del paciente, puede ver
// esta pantalla). Solo permite ANULAR una nota ya finalizada, nunca
// editarla ni borrarla: si un especialista se equivocó al diligenciarla,
// la corrección queda registrada con motivo y trazabilidad, y el
// especialista debe diligenciar una nota nueva en otra cita si hace falta.
export default function AdminHistoriasClinicas() {
  const [registros, setRegistros] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [anulando, setAnulando] = useState(null); // id de la fila en proceso

  function cargar() {
    setCargando(true);
    api
      .get('/admin/historias-clinicas', { params: { q: busqueda || undefined } })
      .then((res) => {
        setRegistros(res.data.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'No fue posible cargar las historias clínicas.'))
      .finally(() => setCargando(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(cargar, [busqueda]);

  async function anular(registro) {
    const motivo = window.prompt(
      `Vas a ANULAR la historia clínica #${registro.id} (${registro.Colaborador?.Usuario?.nombre || 'paciente'} con ${registro.Especialista?.Usuario?.nombre || 'especialista'}).\n\n` +
        'Esto es irreversible desde esta pantalla y queda registrado con tu usuario y la fecha. Describe el motivo de la corrección:'
    );
    if (motivo === null) return; // canceló el prompt
    if (motivo.trim().length < 5) {
      window.alert('Describe el motivo con al menos 5 caracteres.');
      return;
    }
    setAnulando(registro.id);
    try {
      await api.patch(`/admin/historias-clinicas/${registro.id}/anular`, { motivo: motivo.trim() });
      cargar();
    } catch (err) {
      window.alert(err.response?.data?.error || 'No fue posible anular la historia clínica.');
    } finally {
      setAnulando(null);
    }
  }

  const columns = [
    {
      key: 'fecha',
      header: 'Fecha de la sesión',
      render: (r) => (r.Cita?.fecha_hora ? new Date(r.Cita.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
    },
    { key: 'paciente', header: 'Paciente', render: (r) => r.Colaborador?.Usuario?.nombre || '—' },
    { key: 'especialista', header: 'Especialista', render: (r) => r.Especialista?.Usuario?.nombre || '—' },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => <EstadoBadge variante={VARIANTE_ESTADO[r.estado] || 'neutro'}>{ETIQUETA_ESTADO[r.estado] || r.estado}</EstadoBadge>,
    },
    {
      key: 'anulada_motivo',
      header: 'Motivo de anulación',
      render: (r) => (r.estado === 'anulada' ? r.anulada_motivo || '—' : '—'),
    },
  ];

  return (
    <div>
      <h2>Historias Clínicas</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Vista de plataforma (todas las empresas) para corrección administrativa. Solo se muestran notas ya finalizadas o
        anuladas — un borrador es trabajo en curso del especialista y no aparece aquí. Anular no borra ni modifica el
        contenido original: lo marca como inválido con motivo y trazabilidad, de forma permanente.
      </p>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <input
          placeholder="Buscar por nombre de paciente o especialista…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ padding: 9, borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-border)', fontSize: 14, minWidth: 280 }}
        />
      </div>

      {cargando ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : (
        <DataTable
          claveGuardado="admin-historias-clinicas"
          columns={columns}
          rows={registros}
          acciones={(r) =>
            r.estado === 'finalizada' ? (
              <button type="button" className="btn-icon-only btn-danger" data-tooltip="Anular (corrección administrativa)" disabled={anulando === r.id} onClick={() => anular(r)}>
                <IconBan />
              </button>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
            )
          }
        />
      )}
    </div>
  );
}
