const { Op } = require('sequelize');
const { Auditoria, Usuario } = require('../models');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');
const { registrarAuditoria } = require('../middlewares/audit');

// Log de actividad del sistema (RBAC.md / middlewares/audit.js ya registra
// una fila de auditoría por cada creación/edición/inactivación/export en
// prácticamente todos los módulos — ver crudFactory.js y los controladores
// de empresa/especialista). Nunca existió una pantalla para consultarlo.
//
// Ventana fija de 30 días: la tabla `auditoria` crece sin límite (una fila
// por cada acción de cada usuario), así que mostrar/exportar todo el
// historial haría el listado cada vez más pesado. No es un filtro que se
// pueda ampliar desde la pantalla a propósito — si algún día se necesita
// retención más larga, es una decisión de negocio/cumplimiento, no un
// parámetro de UI.
const DIAS_RETENCION_VISIBLE = 30;

function desdeHaceNDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha;
}

// OJO: el atributo de fecha de creación en este proyecto NO se llama
// `createdAt` en el lado de Sequelize — la configuración global (ver
// src/config/database.js: `define: { createdAt: 'created_at', ... }`)
// renombra el propio atributo a `created_at` (no solo la columna física).
// Usar `createdAt` aquí compilaba sin error mostrando "Error interno del
// servidor" en tiempo de ejecución, porque Sequelize no reconocía ese
// atributo. Mismo motivo por el que especialistaController.js ya hacía
// `c.createdAt || c.created_at` a modo de parche defensivo en otro lado.
function construirWhere(req) {
  const where = { created_at: { [Op.gte]: desdeHaceNDias(DIAS_RETENCION_VISIBLE) } };
  if (req.query.accion) where.accion = { [Op.like]: `%${req.query.accion}%` };
  if (req.query.entidad) where.entidad = req.query.entidad;
  if (req.query.usuarioId) where.usuario_id = req.query.usuarioId;
  return where;
}

// Se consultan por separado `auditoria` y `usuarios` (en vez de un
// `include`) y se combinan en memoria con un Map — mismo hábito ya
// establecido en el resto del proyecto (ver empresaController.listarOkrs)
// para no repetir el bug de listados vacíos que dio `findAll` + `order` +
// `include` entre dos tablas que ambas tienen `id`.
async function conNombresDeUsuario(registros) {
  const usuarioIds = [...new Set(registros.map((r) => r.usuario_id).filter(Boolean))];
  const usuarios = usuarioIds.length
    ? await Usuario.findAll({ where: { id: usuarioIds }, attributes: ['id', 'nombre', 'email'] })
    : [];
  const usuariosPorId = new Map(usuarios.map((u) => [u.id, u]));
  return registros.map((r) => {
    const plano = r.get({ plain: true });
    const usuario = usuariosPorId.get(plano.usuario_id);
    return {
      ...plano,
      usuarioNombre: usuario?.nombre || 'Sistema',
      usuarioEmail: usuario?.email || null,
    };
  });
}

async function list(req, res, next) {
  try {
    const registros = await Auditoria.findAll({
      where: construirWhere(req),
      order: [['created_at', 'DESC']],
      limit: 500,
    });
    const data = await conNombresDeUsuario(registros);
    res.json({ data, diasRetencion: DIAS_RETENCION_VISIBLE });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'Fecha', key: 'created_at' },
  { header: 'Usuario', key: 'usuarioNombre' },
  { header: 'Email', key: 'usuarioEmail' },
  { header: 'Acción', key: 'accion' },
  { header: 'Entidad', key: 'entidad' },
  { header: 'ID entidad', key: 'entidad_id' },
  { header: 'IP', key: 'ip' },
];

async function exportarAuditoria(req, res, next) {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const registros = await Auditoria.findAll({ where: construirWhere(req), order: [['created_at', 'DESC']] });
    const rows = await conNombresDeUsuario(registros);

    await registrarAuditoria({ req, accion: 'exportar_auditoria', entidad: 'auditoria', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Auditoria');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="auditoria.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, exportarAuditoria, DIAS_RETENCION_VISIBLE };
