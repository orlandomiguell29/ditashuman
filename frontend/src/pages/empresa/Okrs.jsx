import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ExportButtons from '../../components/ExportButtons';
import PermissionGate from '../../components/PermissionGate';
import EstadoBadge from '../../components/EstadoBadge';
import { useAuth } from '../../context/AuthContext';
import { IconPlus, IconEdit } from '../../components/icons';

const ETIQUETAS_ESTADO = { activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado' };
const VARIANTE_ESTADO = { activo: 'info', completado: 'exito', cancelado: 'neutro' };

const FORM_VACIO = { colaboradorId: '', descripcion: '', periodo: '', progresoPct: 0 };

// Gestión de Objetivos del Periodo (OKRs): antes el colaborador tenía una
// pantalla para VER sus OKRs pero RRHH no tenía dónde crearlos — esta
// pantalla cierra ese hueco. RRHH crea el objetivo, lo asigna a un
// colaborador de su empresa, y desde aquí mismo va actualizando el % de
// avance (o lo marca completado/cancelado) a medida que pasa el periodo.
export default function EmpresaOkrs() {
  const { tienePermiso } = useAuth();
  const [okrs, setOkrs] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [filtroColaborador, setFiltroColaborador] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [modalCrear, setModalCrear] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [editando, setEditando] = useState(null); // okr | null
  const [formEditar, setFormEditar] = useState({ descripcion: '', periodo: '', progresoPct: 0, estado: 'activo' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  function cargar() {
    const params = {};
    if (filtroColaborador) params.colaboradorId = filtroColaborador;
    if (filtroPeriodo) params.periodo = filtroPeriodo;
    api
      .get('/empresa/okrs', { params })
      .then((res) => {
        setOkrs(res.data.data);
        setColaboradores(res.data.colaboradores || []);
      })
      .catch(() => setError('No fue posible cargar los objetivos.'));
  }

  useEffect(cargar, [filtroColaborador, filtroPeriodo]);

  function abrirCrear() {
    setError('');
    setForm(FORM_VACIO);
    setModalCrear(true);
  }

  async function crear(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setGuardando(true);
    try {
      await api.post('/empresa/okrs', {
        colaboradorId: Number(form.colaboradorId),
        descripcion: form.descripcion,
        periodo: form.periodo,
        progresoPct: Number(form.progresoPct) || 0,
      });
      setMensaje('Objetivo creado y asignado.');
      setModalCrear(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible crear el objetivo.');
    } finally {
      setGuardando(false);
    }
  }

  function abrirEditar(okr) {
    setError('');
    setEditando(okr);
    setFormEditar({ descripcion: okr.descripcion, periodo: okr.periodo, progresoPct: okr.progreso_pct, estado: okr.estado });
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setError('');
    setGuardandoEdicion(true);
    try {
      await api.patch(`/empresa/okrs/${editando.id}`, {
        descripcion: formEditar.descripcion,
        periodo: formEditar.periodo,
        progresoPct: Number(formEditar.progresoPct),
        estado: formEditar.estado,
      });
      setMensaje('Objetivo actualizado.');
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible guardar los cambios.');
    } finally {
      setGuardandoEdicion(false);
    }
  }

  const columns = [
    { key: 'colaborador', header: 'Colaborador', render: (r) => r.Colaborador?.Usuario?.nombre || '—' },
    { key: 'descripcion', header: 'Objetivo' },
    { key: 'periodo', header: 'Periodo' },
    {
      key: 'progreso_pct',
      header: 'Avance',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
          <div className="progreso-barra" style={{ flex: 1 }}>
            <div className="progreso-relleno" style={{ width: `${r.progreso_pct}%` }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.progreso_pct}%</span>
        </div>
      ),
    },
    { key: 'estado', header: 'Estado', render: (r) => <EstadoBadge variante={VARIANTE_ESTADO[r.estado]}>{ETIQUETAS_ESTADO[r.estado]}</EstadoBadge> },
  ];

  return (
    <div>
      <h2>Objetivos del Periodo (OKRs)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Crea objetivos y asígnalos a tus colaboradores; ellos los ven desde su portal ("Mi Progreso") pero no pueden
        editarlos — el avance lo actualizas aquí a medida que va progresando.
      </p>
      {error && <div className="alert-error">{error}</div>}
      {mensaje && <div className="alert-success">{mensaje}</div>}

      <div className="toolbar">
        <PermissionGate permiso="okrs.crear">
          <button className="btn-primary btn-icon" style={{ width: 'auto' }} onClick={abrirCrear}>
            <IconPlus width={14} height={14} /> Nuevo objetivo
          </button>
        </PermissionGate>
        <select value={filtroColaborador} onChange={(e) => setFiltroColaborador(e.target.value)}>
          <option value="">Todos los colaboradores</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>{c.Usuario?.nombre}</option>
          ))}
        </select>
        <input
          placeholder="Filtrar por periodo (ej: 2026-S2)"
          value={filtroPeriodo}
          onChange={(e) => setFiltroPeriodo(e.target.value)}
          style={{ padding: 9, borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-border)', fontSize: 14 }}
        />
        <ExportButtons endpoint="/empresa/okrs/export" nombreArchivo="okrs_ditash" disabled={!tienePermiso('okrs.exportar')} />
      </div>

      <DataTable
        claveGuardado="empresa-okrs"
        columns={columns}
        rows={okrs}
        acciones={(row) => (
          <PermissionGate permiso="okrs.actualizar">
            <button className="btn-icon-only" data-tooltip="Actualizar avance" onClick={() => abrirEditar(row)}>
              <IconEdit />
            </button>
          </PermissionGate>
        )}
      />

      {modalCrear && (
        <Modal titulo="Nuevo objetivo" onClose={() => setModalCrear(false)}>
          <form onSubmit={crear} className="form-grid">
            {error && <div className="alert-error">{error}</div>}
            <label>Colaborador</label>
            <select required value={form.colaboradorId} onChange={(e) => setForm({ ...form, colaboradorId: e.target.value })}>
              <option value="">Selecciona…</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>{c.Usuario?.nombre}</option>
              ))}
            </select>

            <label>Objetivo</label>
            <textarea
              required
              maxLength={255}
              placeholder="Ej: Reducir el tiempo de respuesta a tickets en 20%"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />

            <label>Periodo</label>
            <input required placeholder="Ej: 2026-S2" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} />

            <label>Avance inicial (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.progresoPct}
              onChange={(e) => setForm({ ...form, progresoPct: e.target.value })}
            />

            <button className="btn-primary" type="submit" disabled={guardando} style={{ marginTop: 15 }}>
              {guardando ? 'Creando…' : 'Crear objetivo'}
            </button>
          </form>
        </Modal>
      )}

      {editando && (
        <Modal titulo={`Actualizar objetivo — ${editando.Colaborador?.Usuario?.nombre || ''}`} onClose={() => setEditando(null)}>
          <form onSubmit={guardarEdicion} className="form-grid">
            {error && <div className="alert-error">{error}</div>}
            <label>Objetivo</label>
            <textarea
              required
              maxLength={255}
              value={formEditar.descripcion}
              onChange={(e) => setFormEditar({ ...formEditar, descripcion: e.target.value })}
            />

            <label>Periodo</label>
            <input required value={formEditar.periodo} onChange={(e) => setFormEditar({ ...formEditar, periodo: e.target.value })} />

            <label>Avance (%)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={formEditar.progresoPct}
              onChange={(e) => setFormEditar({ ...formEditar, progresoPct: e.target.value })}
            />
            <p style={{ textAlign: 'center', fontWeight: 700, marginTop: -8 }}>{formEditar.progresoPct}%</p>

            <label>Estado</label>
            <select value={formEditar.estado} onChange={(e) => setFormEditar({ ...formEditar, estado: e.target.value })}>
              <option value="activo">Activo</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Llegar a 100% marca el objetivo como completado automáticamente si no cambias el estado a mano.
            </p>

            <button className="btn-primary" type="submit" disabled={guardandoEdicion} style={{ marginTop: 15 }}>
              {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
