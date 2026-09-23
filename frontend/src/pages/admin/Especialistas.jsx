import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { IconEdit, IconShield, IconBan, IconCheckCircle } from '../../components/icons';

// Gestión del marketplace de especialistas. El ALTA de un especialista se
// hace desde "Usuarios" (crea usuario + perfil juntos); aquí solo se
// administra lo posterior: verificación, tarifa/comisión y activo/inactivo.
export default function AdminEspecialistas() {
  const { tienePermiso } = useAuth();
  const [especialistas, setEspecialistas] = useState([]);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ especialidad: '', tarifaBase: '', pctComision: '', duracionMinutos: '', categoriaId: '', bio: '' });
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState('');

  function cargar() {
    api
      .get('/especialistas', { params: { incluirInactivos, pageSize: 100 } })
      .then((res) => setEspecialistas(res.data.data))
      .catch(() => setError('No fue posible cargar los especialistas.'));
  }
  useEffect(cargar, [incluirInactivos]);
  // Categoría de bienestar del especialista (ej. "Bienestar emocional"):
  // antes solo se podía definir al darlo de alta desde "Usuarios" — si RRHH
  // se equivocaba o necesitaba reclasificarlo después, no había forma de
  // corregirlo desde ninguna pantalla, aunque el backend ya lo permitía.
  useEffect(() => {
    api.get('/categorias').then((res) => setCategorias(res.data.data)).catch(() => {});
  }, []);

  function abrirEditar(esp) {
    setEditando(esp);
    setForm({
      especialidad: esp.especialidad,
      tarifaBase: esp.tarifa_base,
      pctComision: esp.pct_comision,
      duracionMinutos: esp.duracion_minutos || 60,
      categoriaId: esp.categoria_id || '',
      bio: esp.bio || '',
    });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/especialistas/${editando.id}`, {
        especialidad: form.especialidad,
        tarifaBase: Number(form.tarifaBase),
        pctComision: Number(form.pctComision),
        duracionMinutos: Number(form.duracionMinutos),
        categoriaId: form.categoriaId ? Number(form.categoriaId) : undefined,
        bio: form.bio || undefined,
      });
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar los cambios.');
    }
  }

  async function toggleVerificado(esp) {
    const accion = esp.verificado ? 'revocar-verificacion' : 'verificar';
    try {
      await api.patch(`/especialistas/${esp.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible actualizar la verificación.');
    }
  }

  async function toggleActivo(esp) {
    const accion = esp.activo ? 'inactivar' : 'activar';
    try {
      await api.patch(`/especialistas/${esp.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} el especialista.`);
    }
  }

  const columns = [
    { key: 'nombre', header: 'Nombre', render: (r) => r.Usuario?.nombre },
    { key: 'email', header: 'Email', render: (r) => r.Usuario?.email },
    { key: 'especialidad', header: 'Especialidad' },
    { key: 'categoria', header: 'Categoría', render: (r) => r.CategoriaBienestar?.titulo || '—' },
    { key: 'tarifa_base', header: 'Tarifa', render: (r) => `$${Number(r.tarifa_base).toLocaleString('es-CO')}` },
    { key: 'pct_comision', header: '% Comisión' },
    { key: 'duracion_minutos', header: 'Duración cita', render: (r) => `${r.duracion_minutos || 60} min` },
    { key: 'verificado', header: 'Verificado', render: (r) => (r.verificado ? '✅' : '⏳ Pendiente') },
    { key: 'activo', header: 'Estado', render: (r) => (r.activo ? 'Activo' : 'Inactivo') },
  ];

  return (
    <div>
      <h2>Marketplace de Especialistas</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Un especialista recién dado de alta (desde "Usuarios") no aparece en el marketplace del colaborador hasta ser <strong>verificado</strong>.
      </p>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <label className="checkbox-label">
          <input type="checkbox" checked={incluirInactivos} onChange={(e) => setIncluirInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
        <ExportButtons endpoint="/especialistas/export" nombreArchivo="especialistas_ditash" disabled={!tienePermiso('especialistas.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-especialistas"
        columns={columns}
        rows={especialistas}
        acciones={(row) => (
          <>
            <PermissionGate permiso="especialistas.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
              <button
                className={`btn-icon-only ${row.verificado ? 'btn-danger' : ''}`}
                data-tooltip={row.verificado ? 'Revocar verificación' : 'Verificar'}
                onClick={() => toggleVerificado(row)}
              >
                <IconShield />
              </button>
            </PermissionGate>
            <PermissionGate permiso="especialistas.inactivar">
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
        <Modal titulo={`Editar: ${editando?.Usuario?.nombre}`} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            <label>Especialidad</label>
            <input required value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} />

            <label>Tarifa base (COP)</label>
            <input type="number" min="0" required value={form.tarifaBase} onChange={(e) => setForm({ ...form, tarifaBase: e.target.value })} />

            <label>% Comisión DITASH</label>
            <input type="number" min="0" max="100" step="0.5" required value={form.pctComision} onChange={(e) => setForm({ ...form, pctComision: e.target.value })} />

            <label>Duración de cada reunión (minutos)</label>
            <input
              type="number"
              min="15"
              max="240"
              step="5"
              required
              value={form.duracionMinutos}
              onChange={(e) => setForm({ ...form, duracionMinutos: e.target.value })}
            />
            <small style={{ color: 'var(--text-muted)', marginTop: -10 }}>
              Define el tamaño de los horarios que el colaborador ve al agendar y hasta cuándo queda activo el enlace de videollamada.
            </small>

            <label>Categoría de bienestar</label>
            <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.titulo}</option>
              ))}
            </select>
            <small style={{ color: 'var(--text-muted)', marginTop: -10 }}>
              Determina en qué sección del marketplace lo ve el colaborador (ej. "Bienestar emocional").
            </small>

            <label>Biografía / presentación</label>
            <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
