import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { IconEdit, IconBan, IconCheckCircle } from '../../components/icons';

const vacio = { codigo: '', titulo: '', icono: '', orden: 0, items: [] };

export default function AdminCategorias() {
  const { tienePermiso } = useAuth();
  const [categorias, setCategorias] = useState([]);
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vacio);
  const [nuevoItem, setNuevoItem] = useState('');
  const [error, setError] = useState('');

  function cargar() {
    api
      .get('/categorias', { params: { incluirInactivos: incluirInactivas } })
      .then((res) => setCategorias(res.data.data))
      .catch(() => setError('No fue posible cargar las categorías.'));
  }
  useEffect(cargar, [incluirInactivas]);

  function abrirCrear() {
    setEditando(null);
    setForm(vacio);
    setModalAbierto(true);
  }

  function abrirEditar(cat) {
    setEditando(cat);
    setForm({ titulo: cat.titulo, icono: cat.icono || '', orden: cat.orden, items: (cat.CategoriaItems || []).map((i) => i.nombre) });
    setModalAbierto(true);
  }

  function agregarItem() {
    const valor = nuevoItem.trim();
    if (!valor) return;
    setForm((f) => ({ ...f, items: [...f.items, valor] }));
    setNuevoItem('');
  }

  function quitarItem(idx) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      if (editando) {
        await api.put(`/categorias/${editando.id}`, { titulo: form.titulo, icono: form.icono, orden: Number(form.orden), items: form.items });
      } else {
        await api.post('/categorias', { ...form, orden: Number(form.orden) });
      }
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar la categoría.');
    }
  }

  async function toggleActivo(cat) {
    const accion = cat.activo ? 'inactivar' : 'activar';
    try {
      await api.patch(`/categorias/${cat.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} la categoría.`);
    }
  }

  const columns = [
    { key: 'titulo', header: 'Título' },
    { key: 'codigo', header: 'Código' },
    { key: 'items', header: '# Ítems', render: (r) => r.CategoriaItems?.length ?? 0 },
    { key: 'activo', header: 'Estado', render: (r) => (r.activo ? 'Activa' : 'Inactiva') },
  ];

  return (
    <div>
      <h2>Categorías de Bienestar</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Cada categoría agrupa los servicios que el colaborador ve al explorar el marketplace de especialistas.
      </p>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <PermissionGate permiso="categorias.crear">
          <button className="btn-primary" onClick={abrirCrear}>+ Nueva categoría</button>
        </PermissionGate>
        <label className="checkbox-label">
          <input type="checkbox" checked={incluirInactivas} onChange={(e) => setIncluirInactivas(e.target.checked)} />
          Mostrar inactivas
        </label>
        <ExportButtons endpoint="/categorias/export" nombreArchivo="categorias_ditash" disabled={!tienePermiso('categorias.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-categorias"
        columns={columns}
        rows={categorias}
        acciones={(row) => (
          <>
            <PermissionGate permiso="categorias.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
            </PermissionGate>
            <PermissionGate permiso="categorias.inactivar">
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
        <Modal titulo={editando ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            {!editando && (
              <>
                <label>Código (identificador interno)</label>
                <input
                  required
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="bienestar_emocional"
                />
              </>
            )}

            <label>Título</label>
            <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />

            <label>Ícono (clase, opcional)</label>
            <input value={form.icono} onChange={(e) => setForm({ ...form, icono: e.target.value })} placeholder="fa-heart-pulse" />

            <label>Orden de aparición</label>
            <input type="number" min="0" value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })} />

            <label>Servicios incluidos</label>
            <div className="inline-form">
              <input
                value={nuevoItem}
                onChange={(e) => setNuevoItem(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' ? (e.preventDefault(), agregarItem()) : null)}
                placeholder="Ej: Psicólogos"
              />
              <button type="button" className="btn-xs" onClick={agregarItem}>Agregar</button>
            </div>
            <div className="competencies-list">
              {form.items.map((item, idx) => (
                <span key={idx} className="badge-comp">
                  {item}{' '}
                  <button type="button" onClick={() => quitarItem(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)' }}>×</button>
                </span>
              ))}
            </div>

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
