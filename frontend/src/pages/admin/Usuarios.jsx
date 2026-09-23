import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { IconEdit, IconKey, IconBan, IconCheckCircle } from '../../components/icons';

const FORM_VACIO = {
  nombre: '', email: '', password: '', rolId: '', empresaId: '', cargo: '', area: '', telefono: '',
  especialidad: '', tarifaBase: '', categoriaId: '',
};

export default function AdminUsuarios() {
  const { usuario: yo, tienePermiso } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  function cargar() {
    api.get('/usuarios', { params: { pageSize: 100 } }).then((res) => setUsuarios(res.data.data)).catch(() => setError('No fue posible cargar los usuarios.'));
    api
      .get('/roles')
      .then((res) => {
        // Un ADMIN_EMPRESA no puede crear SUPER_ADMIN ni ESPECIALISTA (el
        // backend lo bloquea igualmente; esto solo evita ofrecer una opción
        // que terminaría en un error de permisos confuso para el usuario).
        const rolesActivos = res.data.data.filter((r) => r.activo);
        const visibles = yo?.rol === 'SUPER_ADMIN' ? rolesActivos : rolesActivos.filter((r) => !['SUPER_ADMIN', 'ESPECIALISTA'].includes(r.codigo));
        setRoles(visibles);
      })
      .catch(() => {});
    if (yo?.rol === 'SUPER_ADMIN') {
      api.get('/empresas', { params: { pageSize: 100 } }).then((res) => setEmpresas(res.data.data)).catch(() => {});
    }
    api.get('/categorias').then((res) => setCategorias(res.data.data)).catch(() => {});
  }
  useEffect(cargar, [yo]);

  // El rol elegido determina qué campos adicionales se piden: un
  // ESPECIALISTA necesita especialidad/tarifa (y no pertenece a empresa),
  // el resto de roles sí requieren empresa (salvo SUPER_ADMIN).
  const rolSeleccionado = useMemo(() => roles.find((r) => String(r.id) === String(form.rolId)), [roles, form.rolId]);
  const esEspecialista = rolSeleccionado?.codigo === 'ESPECIALISTA';
  const esSuperAdmin = rolSeleccionado?.codigo === 'SUPER_ADMIN';
  const requiereEmpresa = !esEspecialista && !esSuperAdmin;

  function abrirCrear() {
    setEditando(null);
    setForm({
      ...FORM_VACIO,
      rolId: roles[0]?.id || '',
      empresaId: yo?.rol === 'SUPER_ADMIN' ? '' : yo?.empresaId || '',
    });
    setModalAbierto(true);
  }

  function abrirEditar(usuario) {
    setEditando(usuario);
    setForm({
      ...FORM_VACIO,
      nombre: usuario.nombre,
      cargo: usuario.cargo || '',
      area: usuario.area || '',
      telefono: usuario.telefono || '',
      empresaId: usuario.empresa_id || '',
    });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    try {
      if (editando) {
        await api.put(`/usuarios/${editando.id}`, {
          nombre: form.nombre,
          cargo: form.cargo,
          area: form.area,
          telefono: form.telefono,
          ...(yo?.rol === 'SUPER_ADMIN' && form.empresaId ? { empresaId: Number(form.empresaId) } : {}),
        });
      } else {
        await api.post('/usuarios', {
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rolId: Number(form.rolId),
          empresaId: requiereEmpresa ? Number(form.empresaId) : undefined,
          cargo: form.cargo || undefined,
          area: form.area || undefined,
          telefono: form.telefono || undefined,
          ...(esEspecialista
            ? {
                especialidad: form.especialidad,
                tarifaBase: Number(form.tarifaBase),
                categoriaId: form.categoriaId ? Number(form.categoriaId) : undefined,
              }
            : {}),
        });
      }
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar el usuario.');
    }
  }

  async function toggleEstado(usuario) {
    const accion = usuario.estado === 'inactivo' ? 'activar' : 'inactivar';
    if (accion === 'inactivar' && !window.confirm(`¿Inactivar a ${usuario.nombre}? Perderá acceso inmediato al sistema.`)) return;
    try {
      await api.patch(`/usuarios/${usuario.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} el usuario.`);
    }
  }

  async function resetPassword(usuario) {
    try {
      const { data } = await api.post(`/usuarios/${usuario.id}/reset-password`);
      setMensaje(`Contraseña temporal para ${usuario.email}: ${data.passwordTemporal}`);
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible resetear la contraseña.');
    }
  }

  const columns = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'email', header: 'Email' },
    { key: 'rol', header: 'Rol', render: (r) => r.Rol?.codigo },
    { key: 'empresa', header: 'Empresa', render: (r) => r.Empresa?.nombre || '—' },
    { key: 'telefono', header: 'Teléfono' },
    { key: 'estado', header: 'Estado' },
  ];

  return (
    <div>
      <h2>Gestión de Usuarios</h2>
      {error && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="toolbar">
        <PermissionGate permiso="usuarios.crear">
          <button className="btn-primary" onClick={abrirCrear}>+ Nuevo usuario</button>
        </PermissionGate>
        <ExportButtons endpoint="/usuarios/export" nombreArchivo="usuarios_ditash" disabled={!tienePermiso('usuarios.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-usuarios"
        columns={columns}
        rows={usuarios}
        acciones={(row) => (
          <>
            <PermissionGate permiso="usuarios.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
              <button className="btn-icon-only" data-tooltip="Resetear clave" onClick={() => resetPassword(row)}>
                <IconKey />
              </button>
            </PermissionGate>
            <PermissionGate permiso="usuarios.inactivar">
              <button
                className={`btn-icon-only ${row.estado !== 'inactivo' ? 'btn-danger' : ''}`}
                disabled={row.id === yo?.id}
                data-tooltip={row.id === yo?.id ? 'No puedes inactivar tu propia cuenta' : row.estado === 'inactivo' ? 'Activar' : 'Inactivar'}
                onClick={() => toggleEstado(row)}
              >
                {row.estado === 'inactivo' ? <IconCheckCircle /> : <IconBan />}
              </button>
            </PermissionGate>
          </>
        )}
      />

      {modalAbierto && (
        <Modal titulo={editando ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            <label>Nombre</label>
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

            {!editando && (
              <>
                <label>Email</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

                <label>Contraseña temporal</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Mín. 8 car., mayúscula, minúscula, número y símbolo"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />

                <label>Rol</label>
                <select required value={form.rolId} onChange={(e) => setForm({ ...form, rolId: e.target.value })}>
                  <option value="" disabled>Selecciona un rol…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </>
            )}

            {(requiereEmpresa || (editando && yo?.rol === 'SUPER_ADMIN')) && (
              <>
                <label>Empresa</label>
                {yo?.rol === 'SUPER_ADMIN' ? (
                  <select required={!editando} value={form.empresaId} onChange={(e) => setForm({ ...form, empresaId: e.target.value })}>
                    <option value="" disabled>Selecciona una empresa…</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                ) : (
                  <input disabled value={empresas.find((e) => e.id === yo?.empresaId)?.nombre || 'Tu empresa'} />
                )}
              </>
            )}

            {!editando && esEspecialista && (
              <>
                <label>Especialidad</label>
                <input required value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} placeholder="Ej: Psicóloga Clínica" />

                <label>Tarifa base (COP)</label>
                <input type="number" min="0" required value={form.tarifaBase} onChange={(e) => setForm({ ...form, tarifaBase: e.target.value })} />

                <label>Categoría (opcional)</label>
                <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo}</option>
                  ))}
                </select>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  El especialista quedará <strong>pendiente de verificación</strong>: no aparecerá en el marketplace hasta que lo verifiques desde "Especialistas".
                </p>
              </>
            )}

            <label>Cargo</label>
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />

            <label>Área</label>
            <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />

            <label>Teléfono</label>
            <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
