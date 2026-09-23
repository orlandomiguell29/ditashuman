import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { IconEdit, IconBan, IconCheckCircle } from '../../components/icons';

// Diccionario de competencias usado por el módulo de Evaluación de
// Desempeño (ver pages/empresa/Evaluaciones.jsx). Mantenerlo editable aquí
// evita tener que tocar código para agregar una competencia nueva.
export default function AdminCompetencias() {
  const { tienePermiso } = useAuth();
  const [competencias, setCompetencias] = useState([]);
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });
  const [error, setError] = useState('');

  function cargar() {
    api
      .get('/competencias', { params: { incluirInactivos: incluirInactivas, pageSize: 100 } })
      .then((res) => setCompetencias(res.data.data))
      .catch(() => setError('No fue posible cargar las competencias.'));
  }
  useEffect(cargar, [incluirInactivas]);

  function abrirCrear() {
    setEditando(null);
    setForm({ nombre: '', descripcion: '' });
    setModalAbierto(true);
  }

  function abrirEditar(c) {
    setEditando(c);
    setForm({ nombre: c.nombre, descripcion: c.descripcion || '' });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      if (editando) await api.put(`/competencias/${editando.id}`, form);
      else await api.post('/competencias', form);
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar la competencia.');
    }
  }

  async function toggleActivo(c) {
    const accion = c.activo ? 'inactivar' : 'activar';
    try {
      await api.patch(`/competencias/${c.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} la competencia.`);
    }
  }

  const columns = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'descripcion', header: 'Descripción' },
    { key: 'activo', header: 'Estado', render: (r) => (r.activo ? 'Activa' : 'Inactiva') },
  ];

  return (
    <div>
      <h2>Diccionario de Competencias</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <PermissionGate permiso="evaluaciones.crear">
          <button className="btn-primary" onClick={abrirCrear}>+ Nueva competencia</button>
        </PermissionGate>
        <label className="checkbox-label">
          <input type="checkbox" checked={incluirInactivas} onChange={(e) => setIncluirInactivas(e.target.checked)} />
          Mostrar inactivas
        </label>
        <ExportButtons endpoint="/competencias/export" nombreArchivo="competencias_ditash" disabled={!tienePermiso('evaluaciones.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-competencias"
        columns={columns}
        rows={competencias}
        acciones={(row) => (
          <>
            <PermissionGate permiso="evaluaciones.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
            </PermissionGate>
            <PermissionGate permiso="evaluaciones.inactivar">
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
        <Modal titulo={editando ? 'Editar competencia' : 'Nueva competencia'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            <label>Nombre</label>
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
