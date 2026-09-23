import { useEffect, useState } from 'react';
import api from '../../api/axiosClient';
import DataTable from '../../components/DataTable';
import ExportButtons from '../../components/ExportButtons';
import { useAuth } from '../../context/AuthContext';
import { IconCheckCircle, IconLock, IconUnlock } from '../../components/icons';

const ETIQUETAS_ESTADO = { pendiente: 'Pendiente', pagado: 'Pagado', retenido: 'Retenido' };

// Liquidación de comisiones del marketplace de especialistas. Acción
// financiera de plataforma: exclusiva de SUPER_ADMIN (ver
// comisionesController.js, que lo exige incluso si el permiso genérico
// se concediera a otro rol).
export default function AdminComisiones() {
  const { tienePermiso } = useAuth();
  const [comisiones, setComisiones] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [error, setError] = useState('');

  function cargar() {
    api
      .get('/comisiones', { params: { estado: filtroEstado || undefined, pageSize: 100 } })
      .then((res) => setComisiones(res.data.data))
      .catch(() => setError('No fue posible cargar las comisiones.'));
  }
  useEffect(cargar, [filtroEstado]);

  async function pagar(comision) {
    if (!window.confirm(`¿Confirmar el pago de $${Number(comision.monto_neto).toLocaleString('es-CO')} a ${comision.especialistaNombre}? Esta acción registra que la transferencia ya se realizó fuera del sistema.`)) return;
    setError('');
    try {
      await api.patch(`/comisiones/${comision.id}/pagar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible marcar la comisión como pagada.');
    }
  }

  async function retener(comision) {
    setError('');
    try {
      await api.patch(`/comisiones/${comision.id}/retener`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible retener la comisión.');
    }
  }

  async function liberar(comision) {
    setError('');
    try {
      await api.patch(`/comisiones/${comision.id}/liberar`);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No fue posible liberar la comisión.');
    }
  }

  const columns = [
    { key: 'especialistaNombre', header: 'Especialista', render: (r) => r.especialistaNombre },
    { key: 'colaboradorNombre', header: 'Colaborador atendido', render: (r) => r.colaboradorNombre },
    { key: 'periodo_liquidacion', header: 'Periodo' },
    { key: 'monto_bruto', header: 'Bruto', render: (r) => `$${Number(r.monto_bruto).toLocaleString('es-CO')}` },
    { key: 'monto_comision', header: 'Comisión DITASH', render: (r) => `$${Number(r.monto_comision).toLocaleString('es-CO')}` },
    { key: 'monto_neto', header: 'Neto a pagar', render: (r) => `$${Number(r.monto_neto).toLocaleString('es-CO')}` },
    { key: 'estado', header: 'Estado', render: (r) => ETIQUETAS_ESTADO[r.estado] },
    { key: 'fecha_pago', header: 'Fecha de pago', render: (r) => r.fecha_pago || '—' },
  ];

  return (
    <div>
      <h2>Liquidación de Comisiones — Marketplace</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Marcar una comisión como "Pagada" registra que la transferencia ya se hizo fuera del sistema (este entregable no
        integra una pasarela de pagos real — ver SECURITY.md). "Retener" la excluye del total pendiente mientras se
        resuelve una disputa, sin perder el registro.
      </p>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--gray-border)' }}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
          <option value="retenido">Retenido</option>
        </select>
        <ExportButtons endpoint="/comisiones/export" nombreArchivo="comisiones_ditash" disabled={!tienePermiso('comisiones.exportar')} />
      </div>

      <DataTable
        claveGuardado="admin-comisiones"
        columns={columns}
        rows={comisiones}
        acciones={(row) => (
          <>
            {row.estado !== 'pagado' && (
              <button className="btn-icon-only" data-tooltip="Marcar pagada" onClick={() => pagar(row)}>
                <IconCheckCircle />
              </button>
            )}
            {row.estado === 'pendiente' && (
              <button className="btn-icon-only btn-danger" data-tooltip="Retener" onClick={() => retener(row)}>
                <IconLock />
              </button>
            )}
            {row.estado === 'retenido' && (
              <button className="btn-icon-only" data-tooltip="Liberar" onClick={() => liberar(row)}>
                <IconUnlock />
              </button>
            )}
          </>
        )}
      />
    </div>
  );
}
