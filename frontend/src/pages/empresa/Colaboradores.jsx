import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import ExportButtons from '../../components/ExportButtons';
import Modal from '../../components/Modal';
import PermissionGate from '../../components/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import { IconBookOpen, IconRefresh, IconEdit, IconBan, IconCheckCircle } from '../../components/icons';

const FORM_VACIO = { nombre: '', cargo: '', area: '', telefono: '' };

// Directorio de colaboradores de la empresa. Antes la edición (cargo, área,
// estado) solo era posible desde "Usuarios", obligando a RRHH a saltar de
// pantalla para algo tan común como corregir un cargo. Ahora el CRUD básico
// (editar datos, activar/inactivar) vive también aquí, sobre el mismo
// endpoint de usuarios que ya sincroniza estos campos con el registro de
// Colaborador.
export default function EmpresaColaboradores() {
  const { usuario: yo, tienePermiso } = useAuth();
  const [colaboradores, setColaboradores] = useState([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);

  // Progreso de cursos del colaborador seleccionado, y control de intentos
  // de evaluación: antes RRHH no tenía forma de dar más intentos ni de ver
  // en qué va cada colaborador en la Academia Virtual.
  const [cursosModal, setCursosModal] = useState(null); // colaborador | null
  const [cursosLista, setCursosLista] = useState([]);
  const [cursosError, setCursosError] = useState('');

  function cargar() {
    api
      .get('/empresa/colaboradores', { params: { pageSize: 100 } })
      .then((res) => setColaboradores(res.data.data))
      .catch(() => setError('No fue posible cargar el directorio de colaboradores.'));
  }
  useEffect(cargar, []);

  function abrirEditar(colaborador) {
    setError('');
    setEditando(colaborador);
    setForm({
      nombre: colaborador.Usuario?.nombre || '',
      cargo: colaborador.cargo || '',
      area: colaborador.area || '',
      telefono: colaborador.Usuario?.telefono || '',
    });
    setModalAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    try {
      await api.put(`/usuarios/${editando.Usuario.id}`, form);
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar los cambios del colaborador.');
    }
  }

  async function toggleEstado(colaborador) {
    const usuario = colaborador.Usuario;
    const accion = usuario.estado === 'inactivo' ? 'activar' : 'inactivar';
    if (accion === 'inactivar' && !window.confirm(`¿Inactivar a ${usuario.nombre}? Perderá acceso inmediato al sistema.`)) return;
    setError('');
    try {
      await api.patch(`/usuarios/${usuario.id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || `No fue posible ${accion} al colaborador.`);
    }
  }

  function abrirCursos(colaborador) {
    setCursosError('');
    setCursosModal(colaborador);
    api
      .get(`/empresa/colaboradores/${colaborador.id}/cursos`)
      .then((res) => setCursosLista(res.data.data))
      .catch((err) => setCursosError(err.response?.data?.error || 'No fue posible cargar el progreso de cursos.'));
  }

  async function reiniciarIntentos(inscripcion) {
    if (!window.confirm(`¿Reiniciar los intentos de evaluación de "${inscripcion.Curso?.titulo}"? El colaborador podrá presentarla de nuevo desde cero.`)) return;
    setCursosError('');
    try {
      const { data } = await api.patch(`/empresa/colaboradores/${cursosModal.id}/cursos/${inscripcion.id}/reiniciar-evaluacion`);
      setCursosLista((lista) => lista.map((i) => (i.id === inscripcion.id ? { ...i, ...data.data } : i)));
    } catch (err) {
      setCursosError(err.response?.data?.error || 'No fue posible reiniciar los intentos.');
    }
  }

  const columns = [
    { key: 'nombre', header: 'Nombre', render: (r) => r.Usuario?.nombre },
    { key: 'email', header: 'Email', render: (r) => r.Usuario?.email },
    { key: 'cargo', header: 'Cargo' },
    { key: 'area', header: 'Área' },
    { key: 'fecha_ingreso', header: 'Fecha de ingreso' },
    { key: 'estado', header: 'Estado de la cuenta', render: (r) => r.Usuario?.estado },
  ];

  return (
    <div>
      <h2>Directorio de Colaboradores</h2>
      {error && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="toolbar">
        <ExportButtons endpoint="/empresa/colaboradores/export" nombreArchivo="colaboradores_ditash" disabled={!tienePermiso('colaboradores.exportar')} />
      </div>

      <DataTable
        claveGuardado="empresa-colaboradores"
        columns={columns}
        rows={colaboradores}
        acciones={(row) => (
          <>
            <PermissionGate permiso="usuarios.actualizar">
              <button className="btn-icon-only" data-tooltip="Editar" onClick={() => abrirEditar(row)}>
                <IconEdit />
              </button>
            </PermissionGate>
            <PermissionGate permiso="cursos.leer">
              <button className="btn-icon-only" data-tooltip="Cursos / intentos" onClick={() => abrirCursos(row)}>
                <IconBookOpen />
              </button>
            </PermissionGate>
            <PermissionGate permiso="usuarios.inactivar">
              <button
                className={`btn-icon-only ${row.Usuario?.estado !== 'inactivo' ? 'btn-danger' : ''}`}
                disabled={row.Usuario?.id === yo?.id}
                data-tooltip={row.Usuario?.id === yo?.id ? 'No puedes inactivar tu propia cuenta' : row.Usuario?.estado === 'inactivo' ? 'Activar' : 'Inactivar'}
                onClick={() => toggleEstado(row)}
              >
                {row.Usuario?.estado === 'inactivo' ? <IconCheckCircle /> : <IconBan />}
              </button>
            </PermissionGate>
          </>
        )}
      />

      {modalAbierto && (
        <Modal titulo={`Editar colaborador — ${editando?.Usuario?.nombre || ''}`} onClose={() => setModalAbierto(false)}>
          <form onSubmit={guardar} className="form-grid">
            <label>Nombre</label>
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

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

      {cursosModal && (
        <Modal titulo={`Cursos de ${cursosModal.Usuario?.nombre}`} onClose={() => setCursosModal(null)}>
          {cursosError && <div className="alert-error">{cursosError}</div>}
          <ul className="simple-list">
            {cursosLista.map((i) => {
              const maxIntentos = i.Curso?.max_intentos_evaluacion || 2;
              const agotado = !i.quiz_aprobado && i.quiz_intentos >= maxIntentos;
              return (
                <li key={i.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{i.Curso?.titulo}</strong>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Estado: {i.estado} · Videos vistos: {i.InscripcionCursoVideos?.length || 0}
                        {' · '}Intentos de evaluación: {i.quiz_intentos}/{maxIntentos}
                        {i.quiz_aprobado ? ' · Evaluación aprobada ✔' : agotado ? ' · Intentos agotados ⚠️' : ''}
                      </p>
                    </div>
                    <PermissionGate permiso="cursos.actualizar">
                      {i.estado !== 'completado' && i.quiz_intentos > 0 && (
                        <button className="btn-icon-only" data-tooltip="Reiniciar intentos" onClick={() => reiniciarIntentos(i)}>
                          <IconRefresh />
                        </button>
                      )}
                    </PermissionGate>
                  </div>
                </li>
              );
            })}
            {cursosLista.length === 0 && !cursosError && <li style={{ color: 'var(--text-muted)' }}>Este colaborador no está inscrito en ningún curso todavía.</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}
