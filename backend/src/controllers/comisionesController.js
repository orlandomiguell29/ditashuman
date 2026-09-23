const { z } = require('zod');
const { Comision, Especialista, Usuario, Cita, Colaborador } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');

// Administración GLOBAL de comisiones del marketplace de especialistas
// (pagar/retener). Es una acción financiera de plataforma, no de una
// empresa cliente: aunque el catálogo de permisos usa el módulo genérico
// `comisiones`, aquí se exige explícitamente SUPER_ADMIN además del
// permiso, igual que en especialistasAdminController — ninguna empresa
// cliente administra los pagos a los especialistas del marketplace.
function exigirSuperAdmin(req) {
  if (req.user.rol !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'Solo la administración de la plataforma puede gestionar el pago de comisiones.');
  }
}

// Junta especialista (+ su usuario) y colaborador atendido (a través de la
// cita) para cada comisión, en memoria — NO con `include` en la consulta de
// `Comision`. Antes se usaba `Comision.findAndCountAll({ include: [Especialista,
// Cita], order: [['id','DESC']] })`: Especialista Y Cita tienen ambas columna
// `id`, y ordenar por `id` en la consulta padre mientras se hace `include` de
// dos tablas que también tienen `id` es justo el patrón que ya causó bugs de
// relaciones no pobladas en otras partes de este proyecto (ver
// empresaController.listarOkrs, utils/citas.js) — el síntoma aquí era que el
// nombre del especialista salía en blanco ("—") aunque las filas sí cargaban,
// y no había forma de ver qué colaborador fue atendido en esa cita.
async function conEspecialistaYColaborador(comisiones) {
  const especialistaIds = [...new Set(comisiones.map((c) => c.especialista_id))];
  const citaIds = [...new Set(comisiones.map((c) => c.cita_id))];

  const [especialistas, citas] = await Promise.all([
    especialistaIds.length
      ? Especialista.findAll({ where: { id: especialistaIds }, include: [{ model: Usuario, attributes: ['nombre', 'email'] }] })
      : [],
    citaIds.length ? Cita.findAll({ where: { id: citaIds }, attributes: ['id', 'fecha_hora', 'motivo', 'colaborador_id'] }) : [],
  ]);

  const colaboradorIds = [...new Set(citas.map((c) => c.colaborador_id).filter(Boolean))];
  const colaboradores = colaboradorIds.length
    ? await Colaborador.findAll({ where: { id: colaboradorIds }, include: [{ model: Usuario, attributes: ['nombre'] }] })
    : [];

  const especialistaPorId = new Map(especialistas.map((e) => [e.id, e]));
  const citaPorId = new Map(citas.map((c) => [c.id, c]));
  const colaboradorPorId = new Map(colaboradores.map((c) => [c.id, c]));

  return comisiones.map((c) => {
    const plano = c.get({ plain: true });
    const especialista = especialistaPorId.get(plano.especialista_id);
    const cita = citaPorId.get(plano.cita_id);
    const colaborador = cita ? colaboradorPorId.get(cita.colaborador_id) : null;
    return {
      ...plano,
      especialistaNombre: especialista?.Usuario?.nombre || '—',
      colaboradorNombre: colaborador?.Usuario?.nombre || '—',
      citaFecha: cita?.fecha_hora || null,
    };
  });
}

async function list(req, res, next) {
  try {
    exigirSuperAdmin(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
    const where = {};
    if (req.query.estado) where.estado = req.query.estado;

    const { rows: comisiones, count } = await Comision.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['id', 'DESC']],
    });
    const rows = await conEspecialistaYColaborador(comisiones);
    res.json({ data: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
}

const pagarSchema = z.object({
  body: z.object({ fechaPago: z.string().optional() }).strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

// Marca una comisión como pagada (transferencia ya realizada fuera del
// sistema — este entregable no integra una pasarela de pagos real, ver
// README/SECURITY). Solo procede desde 'pendiente' o 'retenido'; una
// comisión ya pagada no se puede volver a pagar por error de doble clic.
async function marcarPagada(req, res, next) {
  try {
    exigirSuperAdmin(req);
    const comision = await Comision.findByPk(req.params.id);
    if (!comision) throw new HttpError(404, 'Comisión no encontrada.');
    if (comision.estado === 'pagado') throw new HttpError(409, 'Esta comisión ya está marcada como pagada.');

    comision.estado = 'pagado';
    comision.fecha_pago = req.body.fechaPago || new Date().toISOString().slice(0, 10);
    await comision.save();

    await registrarAuditoria({ req, accion: 'marcar_comision_pagada', entidad: 'comisiones', entidadId: comision.id, detalles: { fechaPago: comision.fecha_pago } });
    res.json({ data: comision });
  } catch (err) {
    next(err);
  }
}

// Retiene una comisión (disputa, cita cuestionada, verificación pendiente):
// la excluye del total "por pagar" hasta resolverse, sin borrarla.
async function marcarRetenida(req, res, next) {
  try {
    exigirSuperAdmin(req);
    const comision = await Comision.findByPk(req.params.id);
    if (!comision) throw new HttpError(404, 'Comisión no encontrada.');
    if (comision.estado === 'pagado') throw new HttpError(409, 'Una comisión ya pagada no puede retenerse.');

    comision.estado = 'retenido';
    await comision.save();
    await registrarAuditoria({ req, accion: 'retener_comision', entidad: 'comisiones', entidadId: comision.id });
    res.json({ data: comision });
  } catch (err) {
    next(err);
  }
}

// Revierte una retención a 'pendiente' (la disputa se resolvió a favor del
// especialista y la comisión vuelve a quedar disponible para pago).
async function liberarRetencion(req, res, next) {
  try {
    exigirSuperAdmin(req);
    const comision = await Comision.findByPk(req.params.id);
    if (!comision) throw new HttpError(404, 'Comisión no encontrada.');
    if (comision.estado !== 'retenido') throw new HttpError(409, 'Solo una comisión retenida puede liberarse.');

    comision.estado = 'pendiente';
    await comision.save();
    await registrarAuditoria({ req, accion: 'liberar_retencion_comision', entidad: 'comisiones', entidadId: comision.id });
    res.json({ data: comision });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Especialista', key: 'especialistaNombre' },
  { header: 'Colaborador atendido', key: 'colaboradorNombre' },
  { header: 'Cita', key: 'cita_id' },
  { header: 'Bruto', key: 'monto_bruto' },
  { header: '% Comisión', key: 'pct_comision' },
  { header: 'Comisión DITASH', key: 'monto_comision' },
  { header: 'Neto especialista', key: 'monto_neto' },
  { header: 'Periodo', key: 'periodo_liquidacion' },
  { header: 'Estado', key: 'estado' },
  { header: 'Fecha de pago', key: 'fecha_pago' },
];

async function exportData(req, res, next) {
  try {
    exigirSuperAdmin(req);
    const format = (req.query.format || 'xlsx').toLowerCase();
    const comisiones = await Comision.findAll({ order: [['id', 'DESC']] });
    const rows = await conEspecialistaYColaborador(comisiones);

    await registrarAuditoria({ req, accion: 'exportar_comisiones', entidad: 'comisiones', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Comisiones');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="comisiones.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="comisiones.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, marcarPagada, marcarRetenida, liberarRetencion, exportData, pagarSchema };
