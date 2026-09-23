import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import ExportButtons from '../../components/ExportButtons';

// Log de actividad del sistema: quién hizo qué y cuándo (crear/editar/
// inactivar/exportar en cualquier módulo). Se registra automáticamente en
// el backend desde hace tiempo (ver middlewares/audit.js), pero nunca hubo
// una pantalla para consultarlo — solo vivía en la base de datos.
//
// Ventana fija de 30 días: el backend nunca devuelve nada más antiguo (no es
// un filtro que se pueda ampliar desde acá), porque el log crece sin límite
// y mostrar/exportar todo el historial lo volvería cada vez más pesado.
const ETIQUETAS_ACCION = {
  crear: 'Creó',
  actualizar: 'Actualizó',
  inactivar: 'Inactivó',
  activar: 'Reactivó',
  exportar: 'Exportó',
  confirmar_cita: 'Confirmó una cita',
  cancelar_cita: 'Canceló una cita',
  reagendar_cita: 'Reagendó una cita',
  marcar_completada: 'Marcó completada una cita',
};

function etiquetaAccion(accion) {
  const [prefijo] = accion.split('_');
  return ETIQUETAS_ACCION[accion] || ETIQUETAS_ACCION[prefijo] || accion;
}

export default function AdminAuditoria() {
  const [registros, setRegistros] = useState([]);
  const [diasRetencion, setDiasRetencion] = useState(30);
  const [filtroAccion, setFiltroAccion] = useState('');
  const [filtroEntidad, setFiltroEntidad] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  function cargar() {
    setCargando(true);
    api
      .get('/admin/auditoria', { params: { accion: filtroAccion || undefined, entidad: filtroEntidad || undefined } })
      .then((res) => {
        setRegistros(res.data.data);
        setDiasRetencion(res.data.diasRetencion);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || `No fue posible cargar el log de actividad (${err.response?.status || 'sin conexión con el servidor'}).`))
      .finally(() => setCargando(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(cargar, [filtroAccion, filtroEntidad]);

  const entidades = [...new Set(registros.map((r) => r.entidad).filter(Boolean))].sort();

  const columns = [
    {
      key: 'created_at',
      header: 'Fecha',
      render: (r) => new Date(r.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
    },
    { key: 'usuarioNombre', header: 'Usuario', render: (r) => (
      <div>
        <div>{r.usuarioNombre}</div>
        {r.usuarioEmail && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.usuarioEmail}</div>}
      </div>
    ) },
    { key: 'accion', header: 'Acción', render: (r) => etiquetaAccion(r.accion) },
    { key: 'entidad', header: 'Módulo', render: (r) => r.entidad || '—' },
    { key: 'entidad_id', header: 'ID afectado', render: (r) => r.entidad_id ?? '—' },
    { key: 'ip', header: 'IP', render: (r) => r.ip || '—' },
  ];

  return (
    <div>
      <h2>Logs del Sistema</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Actividad de los últimos {diasRetencion} días: quién creó, editó, inactivó o exportó algo, en cualquier
        módulo de la plataforma. Por diseño, no se puede ampliar este rango — es una ventana fija para que el
        listado y las exportaciones no crezcan sin control.
      </p>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <input
          placeholder="Buscar por acción (ej: crear, inactivar)"
          value={filtroAccion}
          onChange={(e) => setFiltroAccion(e.target.value)}
          style={{ padding: 9, borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-border)', fontSize: 14 }}
        />
        <select value={filtroEntidad} onChange={(e) => setFiltroEntidad(e.target.value)}>
          <option value="">Todos los módulos</option>
          {entidades.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <ExportButtons endpoint="/admin/auditoria/export" nombreArchivo="auditoria_ditash" />
      </div>

      {cargando ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : (
        <DataTable claveGuardado="admin-auditoria" columns={columns} rows={registros} />
      )}
    </div>
  );
}
