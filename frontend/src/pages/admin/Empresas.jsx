import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { IconEdit, IconBan, IconCheckCircle } from '../../components/icons';

const PLANES = ['basico', 'profesional', 'enterprise'];

// Administración de empresas cliente (multi-tenant). Solo SUPER_ADMIN puede
// ver este módulo en la navegación (ver DashboardLayout), pero los permisos
// reales se validan siempre contra el backend, no solo contra el rol.
export default function AdminEmpresas() {
  const { tienePermiso } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', nit: '', plan: 'basico' });
  const [error, setError] = useState('');

  function cargar() {
    api
      .get('/empresas', { params: { incluirInactivos: incluirInactivas, pageSize: 100 } })
      .then((res) => setEmpresas(res.data.data))
      .catch(() => setError('No fue posible cargar las empresas.'));
  }
  useEffect(cargar, [incluirInactivas]);

  function abrirCrear() {
    setEditando(null);
    setForm({ nombre: '', nit: '', plan: 'basico' });
    setModalAbierto(true);
  }

  function abrirEditar(empresa) {
    setEditando(empresa);
    setForm({ nombre: empresa.nombre, nit: empresa.nit, plan: empresa.plan });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      if (editando) {
        // El NIT no se edita desde aquí: es la identidad fiscal de la
        // empresa (ver justificación en backend/empresasController.js).
        await api.put(`/empresas/${editando.id}`, { nombre: form.nombre, plan: form.plan });
      } else {
        await api.post('/empresas', form);
      }
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar la empresa.');
    }
  }

  async function toggleActivo(empresa) {
    const accion = empresa.activo ? 'inactivar' : 'activar';
    if (empresa.activo && !window.confirm(`¿Inactivar ${empresa.nombre}? Todos sus usuarios perderán acceso hasta reactivarla.`)) return;
    try {
      await api.patch(`/empresas/${empresa.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} la empresa.`);
    }
  }

  const columns = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'nit', header: 'NIT' },
    { key: 'plan', header: 'Plan' },
    { key: 'activo', header: 'Estado', render: (r) => (r.activo ? 'Activa' : 'Inactiva') },
  ];

  return (
    <div>
      <h2>Gestión de Empresas Cliente</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <PermissionGate permiso="empresas.crear">
          <button className="btn-primary" onClick={abrirCrear}>+ Nueva empresa</button>
        </PermissionGate>
        <label className="checkbox-label">
          <input type="checkbox" checked={incluirInactivas} onChange={(e) => setIncluirInactivas(e.target.checked)} />
          Mostrar inactivas
        </label>
        <ExportButtons endpoint="/empresas/export" nombreArchivo="empresas_ditash" disabled={!tienePermiso('empresas.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-empresas"
        columns={columns}
        rows={empresas}
        acciones={(row) => (
          <>
            <PermissionGate permiso="empresas.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
            </PermissionGate>
            <PermissionGate permiso="empresas.inactivar">
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
        <Modal titulo={editando ? 'Editar empresa' : 'Nueva empresa'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            <label>Nombre</label>
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

            <label>NIT</label>
            <input required disabled={!!editando} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} placeholder="900123456-1" />

            <label>Plan</label>
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {PLANES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
