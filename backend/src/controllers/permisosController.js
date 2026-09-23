const { Permiso } = require('../models');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');
const { registrarAuditoria } = require('../middlewares/audit');

// Los permisos son un catálogo fijo generado por el seed a partir de
// src/config/permisos.js (única fuente de verdad). No se exponen endpoints
// de creación/edición manual para evitar códigos de permiso huérfanos que
// ningún middleware `requirePermission` vaya a chequear jamás.

async function list(req, res, next) {
  try {
    const permisos = await Permiso.findAll({ order: [['modulo', 'ASC'], ['accion', 'ASC']] });
    res.json({ data: permisos });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Código', key: 'codigo' },
  { header: 'Módulo', key: 'modulo' },
  { header: 'Acción', key: 'accion' },
  { header: 'Descripción', key: 'descripcion' },
];

async function exportData(req, res, next) {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const rows = (await Permiso.findAll()).map((p) => p.get({ plain: true }));
    await registrarAuditoria({ req, accion: 'exportar_permisos', entidad: 'permisos', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Permisos');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="permisos.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="permisos.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, exportData };
