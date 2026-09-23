import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import EstadoBadge from '../../components/EstadoBadge';
import { IconEdit, IconBan, IconCheckCircle, IconPlus, IconShield } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';

const ETIQUETAS_ACCION = {
  crear: 'Crear',
  leer: 'Ver',
  actualizar: 'Editar',
  inactivar: 'Inactivar',
  exportar: 'Exportar',
};

const ETIQUETAS_MODULO = {
  usuarios: 'Usuarios',
  roles: 'Roles y permisos',
  permisos: 'Catálogo de permisos',
  empresas: 'Empresas cliente',
  colaboradores: 'Colaboradores',
  especialistas: 'Especialistas (marketplace)',
  citas: 'Citas y agenda',
  cursos: 'Academia virtual',
  evaluaciones: 'Evaluaciones de desempeño',
  okrs: 'Objetivos del periodo (OKRs)',
  clima: 'Clima organizacional',
  expedientes: 'Expedientes digitales',
  comisiones: 'Comisiones',
  categorias: 'Categorías de bienestar',
  auditoria: 'Auditoría',
};

// Editor de permisos en forma de MATRIZ módulo × acción. Reemplaza la lista
// plana de checkboxes anterior (poco clara con 14 módulos × 5 acciones = 70
// casillas apiladas dentro de un modal angosto). Ventajas de este diseño:
//  - Se ve de un vistazo qué puede hacer el rol en cada módulo (fila) y qué
//    módulos permiten cada acción (columna).
//  - "Seleccionar todo" por fila y por columna evita marcar de a una.
//  - Vive en un panel de ancho completo (no en el modal de 480px), con
//    scroll horizontal propio (`table-wrapper`) para que funcione también
//    en pantallas angostas.
function MatrizPermisos({ rol, permisos, permisoIdsIniciales, onGuardar, onCancelar, guardando, soloLectura }) {
  const [seleccion, setSeleccion] = useState(new Set(permisoIdsIniciales));
  const [busqueda, setBusqueda] = useState('');

  const modulos = useMemo(() => [...new Set(permisos.map((p) => p.modulo))], [permisos]);
  const acciones = useMemo(() => [...new Set(permisos.map((p) => p.accion))], [permisos]);
  const porModuloAccion = useMemo(() => {
    const mapa = new Map();
    permisos.forEach((p) => mapa.set(`${p.modulo}.${p.accion}`, p.id));
    return mapa;
  }, [permisos]);

  const modulosFiltrados = modulos.filter((m) => (ETIQUETAS_MODULO[m] || m).toLowerCase().includes(busqueda.toLowerCase()) || m.includes(busqueda.toLowerCase()));

  function idsDeModulo(modulo) {
    return acciones.map((a) => porModuloAccion.get(`${modulo}.${a}`)).filter(Boolean);
  }
  function idsDeAccion(accion) {
    return modulos.map((m) => porModuloAccion.get(`${m}.${accion}`)).filter(Boolean);
  }

  function toggle(id) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGrupo(ids, marcar) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (marcar ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  const totalMarcados = seleccion.size;

  return (
    <div className="permisos-panel">
      <div className="permisos-panel-header">
        <div>
          <h3>Permisos de: {rol.nombre}</h3>
          <p className="permisos-panel-subtitle">
            {totalMarcados} de {permisos.length} permisos concedidos
            {soloLectura && ' — rol de sistema, solo lectura'}
          </p>
        </div>
        <input
          className="permisos-buscador"
          placeholder="Buscar módulo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="table-wrapper">
        <table className="data-table matriz-permisos">
          <thead>
            <tr>
              <th>Módulo</th>
              {acciones.map((accion) => {
                const ids = idsDeAccion(accion);
                const todasMarcadas = ids.length > 0 && ids.every((id) => seleccion.has(id));
                return (
                  <th key={accion} className="matriz-col-accion">
                    <label className="checkbox-label matriz-select-all">
                      <input type="checkbox" disabled={soloLectura} checked={todasMarcadas} onChange={(e) => toggleGrupo(ids, e.target.checked)} />
                      {ETIQUETAS_ACCION[accion] || accion}
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {modulosFiltrados.map((modulo) => {
              const ids = idsDeModulo(modulo);
              const todasMarcadas = ids.length > 0 && ids.every((id) => seleccion.has(id));
              return (
                <tr key={modulo}>
                  <td>
                    <label className="checkbox-label matriz-select-all">
                      <input type="checkbox" disabled={soloLectura} checked={todasMarcadas} onChange={(e) => toggleGrupo(ids, e.target.checked)} />
                      <strong>{ETIQUETAS_MODULO[modulo] || modulo}</strong>
                    </label>
                  </td>
                  {acciones.map((accion) => {
                    const id = porModuloAccion.get(`${modulo}.${accion}`);
                    if (!id) return <td key={accion} className="matriz-celda-vacia">—</td>;
                    return (
                      <td key={accion} className="matriz-celda">
                        <input type="checkbox" disabled={soloLectura} checked={seleccion.has(id)} onChange={() => toggle(id)} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="permisos-panel-footer">
        <button className="btn-secondary" style={{ width: 'auto' }} onClick={onCancelar} disabled={guardando}>
          {soloLectura ? 'Cerrar' : 'Cancelar'}
        </button>
        {!soloLectura && (
          <button className="btn-primary" style={{ width: 'auto' }} onClick={() => onGuardar([...seleccion])} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar permisos'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminRoles() {
  const { tienePermiso } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ codigo: '', nombre: '', descripcion: '' });
  const [gestionandoPermisos, setGestionandoPermisos] = useState(null); // rol o null
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  function cargar() {
    api.get('/roles').then((res) => setRoles(res.data.data)).catch(() => setError('No fue posible cargar los roles.'));
    api.get('/permisos').then((res) => setPermisos(res.data.data)).catch(() => {});
  }
  useEffect(cargar, []);

  function abrirCrear() {
    setEditando(null);
    setForm({ codigo: '', nombre: '', descripcion: '' });
    setModalAbierto(true);
  }

  function abrirEditar(rol) {
    setEditando(rol);
    setForm({ nombre: rol.nombre, descripcion: rol.descripcion || '' });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    try {
      if (editando) {
        await api.put(`/roles/${editando.id}`, { nombre: form.nombre, descripcion: form.descripcion });
      } else {
        // Un rol nuevo se crea sin permisos (0 casillas marcadas): se
        // asignan justo después, abriendo directamente la matriz, en vez de
        // obligar a elegir los 70 permisos dentro del mismo formulario de
        // alta (mezclar "qué es el rol" con "qué puede hacer" confundía).
        const { data } = await api.post('/roles', { ...form, permisoIds: [] });
        setModalAbierto(false);
        cargar();
        setGestionandoPermisos(data.data);
        return;
      }
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar el rol.');
    }
  }

  async function toggleActivo(rol) {
    if (rol.es_sistema) return;
    const accion = rol.activo ? 'inactivar' : 'activar';
    if (accion === 'inactivar' && !window.confirm(`¿Inactivar el rol ${rol.nombre}? Ya no podrá asignarse a usuarios nuevos.`)) return;
    try {
      await api.patch(`/roles/${rol.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} el rol.`);
    }
  }

  async function guardarPermisos(permisoIds) {
    setGuardandoPermisos(true);
    setError('');
    try {
      await api.put(`/roles/${gestionandoPermisos.id}`, { permisoIds });
      setMensaje(`Permisos de "${gestionandoPermisos.nombre}" actualizados.`);
      setGestionandoPermisos(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar los permisos.');
    } finally {
      setGuardandoPermisos(false);
    }
  }

  const columns = [
    { key: 'codigo', header: 'Código' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'permisos', header: '# Permisos', render: (r) => <span className="badge-estado info">{r.Permisos?.length ?? 0}</span> },
    { key: 'es_sistema', header: 'Sistema', render: (r) => (r.es_sistema ? <EstadoBadge variante="alerta">Sistema</EstadoBadge> : <EstadoBadge variante="neutro">Personalizado</EstadoBadge>) },
    { key: 'activo', header: 'Estado', render: (r) => <EstadoBadge variante={r.activo ? 'exito' : 'neutro'}>{r.activo ? 'Activo' : 'Inactivo'}</EstadoBadge> },
  ];

  return (
    <div>
      <h2>Gestión de Roles y Permisos</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Un rol agrupa datos básicos (código, nombre) y una matriz de permisos por módulo y acción — usa el ícono{' '}
        <IconShield style={{ verticalAlign: 'middle' }} /> de cada fila para verla o editarla. Los roles de sistema
        (SUPER_ADMIN, ADMIN_EMPRESA, COLABORADOR, ESPECIALISTA) tienen sus permisos fijados por el seed y por eso se
        ven en solo lectura: no es un error, es intencional, para que la plataforma no quede sin nadie con acceso
        total si alguien los desconfigura por accidente. Para crear un rol personalizado con permisos propios, usa
        "Nuevo rol" abajo.{' '}
        <Link to="/admin/permisos" className="btn-link" style={{ fontSize: 14 }}>Ver el catálogo completo de códigos de permiso ↗</Link>
      </p>
      {error && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="toolbar">
        <PermissionGate permiso="roles.crear">
          <button className="btn-primary btn-icon" style={{ width: 'auto' }} onClick={abrirCrear}>
            <IconPlus width={14} height={14} /> Nuevo rol
          </button>
        </PermissionGate>
        <ExportButtons endpoint="/roles/export" nombreArchivo="roles_ditash" disabled={!tienePermiso('roles.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-roles"
        columns={columns}
        rows={roles}
        acciones={(row) => (
          <>
            <PermissionGate permiso="roles.actualizar">
              <button
                className="btn-icon-only"
                disabled={row.es_sistema}
                data-tooltip={row.es_sistema ? 'Los roles de sistema no pueden editarse' : 'Editar'}
                onClick={() => abrirEditar(row)}
              >
                <IconEdit />
              </button>
              <button className="btn-icon-only" data-tooltip={row.es_sistema ? 'Ver permisos' : 'Permisos'} onClick={() => setGestionandoPermisos(row)}>
                <IconShield />
              </button>
            </PermissionGate>
            <PermissionGate permiso="roles.inactivar">
              <button
                className={`btn-icon-only ${row.activo ? 'btn-danger' : ''}`}
                disabled={row.es_sistema}
                data-tooltip={row.es_sistema ? 'Los roles de sistema no pueden inactivarse' : row.activo ? 'Inactivar' : 'Activar'}
                onClick={() => toggleActivo(row)}
              >
                {row.activo ? <IconBan /> : <IconCheckCircle />}
              </button>
            </PermissionGate>
          </>
        )}
      />

      {gestionandoPermisos && (
        <MatrizPermisos
          rol={gestionandoPermisos}
          permisos={permisos}
          permisoIdsIniciales={(roles.find((r) => r.id === gestionandoPermisos.id)?.Permisos || gestionandoPermisos.Permisos || []).map((p) => p.id)}
          guardando={guardandoPermisos}
          soloLectura={gestionandoPermisos.es_sistema}
          onCancelar={() => setGestionandoPermisos(null)}
          onGuardar={guardarPermisos}
        />
      )}

      {modalAbierto && (
        <Modal titulo={editando ? 'Editar rol' : 'Nuevo rol'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            {!editando && (
              <>
                <label>Código (mayúsculas, sin espacios)</label>
                <input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="SUPERVISOR_SST" />
              </>
            )}
            <label>Nombre</label>
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />

            <button className="btn-primary" type="submit" style={{ marginTop: 15 }}>
              {editando ? 'Guardar' : 'Crear y continuar a permisos →'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
