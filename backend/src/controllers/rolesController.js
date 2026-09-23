const { z } = require('zod');
const { Rol, Permiso } = require('../models');
const { registrarAuditoria } = require('../middlewares/audit');
const { HttpError } = require('../middlewares/errorHandler');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');

const include = [{ model: Permiso, attributes: ['id', 'codigo', 'modulo', 'accion'], through: { attributes: [] } }];

const crearRolSchema = z.object({
  body: z.object({
    codigo: z.string().min(2).max(40).regex(/^[A-Z_]+$/, 'Usa mayúsculas y guiones bajos, ej: SUPERVISOR_SST'),
    nombre: z.string().min(2).max(80),
    descripcion: z.string().max(255).optional(),
    permisoIds: z.array(z.coerce.number().int().positive()).default([]),
  }).strict(),
  query: z.any(),
  params: z.any(),
});

const actualizarRolSchema = z.object({
  body: z.object({
    nombre: z.string().min(2).max(80).optional(),
    descripcion: z.string().max(255).optional(),
    activo: z.boolean().optional(),
    permisoIds: z.array(z.coerce.number().int().positive()).optional(),
  }).strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function list(req, res, next) {
  try {
    // Antes: `include` de Permiso (relación muchos-a-muchos vía
    // `rol_permisos`) junto con `order:[['id','ASC']]` en la consulta padre
    // de Rol — mismo patrón de relaciones no pobladas ya visto en otros
    // módulos; acá el síntoma reportado fue un rol mostrando "0 permisos"
    // en la pantalla de administración aunque sí los tuviera asignados
    // (falso positivo de "rol vacío"). Se trae cada rol sin `include` y sus
    // permisos se piden aparte con `rol.getPermisos()` (el getter que
    // Sequelize genera para la relación), en paralelo.
    const rolesBase = await Rol.findAll({ order: [['id', 'ASC']] });
    const roles = await Promise.all(
      rolesBase.map(async (rol) => {
        const permisos = await rol.getPermisos({ attributes: ['id', 'codigo', 'modulo', 'accion'], joinTableAttributes: [] });
        return { ...rol.get({ plain: true }), Permisos: permisos };
      })
    );
    res.json({ data: roles });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const rol = await Rol.findByPk(req.params.id, { include });
    if (!rol) throw new HttpError(404, 'Rol no encontrado.');
    res.json({ data: rol });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { codigo, nombre, descripcion, permisoIds } = req.body;
    const rol = await Rol.create({ codigo, nombre, descripcion, es_sistema: false });
    if (permisoIds.length) await rol.setPermisos(permisoIds);
    await registrarAuditoria({ req, accion: 'crear_rol', entidad: 'roles', entidadId: rol.id, detalles: { permisoIds } });
    res.status(201).json({ data: await Rol.findByPk(rol.id, { include }) });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const rol = await Rol.findByPk(req.params.id);
    if (!rol) throw new HttpError(404, 'Rol no encontrado.');
    if (rol.es_sistema) throw new HttpError(403, 'Los roles de sistema (SUPER_ADMIN, etc.) no pueden modificarse.');

    const { permisoIds, ...resto } = req.body;
    await rol.update(resto);
    if (permisoIds) await rol.setPermisos(permisoIds);

    await registrarAuditoria({ req, accion: 'actualizar_rol', entidad: 'roles', entidadId: rol.id, detalles: req.body });
    res.json({ data: await Rol.findByPk(rol.id, { include }) });
  } catch (err) {
    next(err);
  }
}

// Un rol nunca se borra físicamente: haría inconsistentes a todos los
// usuarios que lo tengan asignado (rol_id huérfano). Se inactiva en su
// lugar; un rol inactivo sigue existiendo pero no debería asignarse a
// usuarios nuevos (el frontend lo excluye del selector de creación).
async function inactivar(req, res, next) {
  try {
    const rol = await Rol.findByPk(req.params.id);
    if (!rol) throw new HttpError(404, 'Rol no encontrado.');
    if (rol.es_sistema) throw new HttpError(403, 'Los roles de sistema (SUPER_ADMIN, ADMIN_EMPRESA, COLABORADOR, ESPECIALISTA) no pueden inactivarse.');

    await rol.update({ activo: false });
    await registrarAuditoria({ req, accion: 'inactivar_rol', entidad: 'roles', entidadId: rol.id });
    res.json({ data: rol });
  } catch (err) {
    next(err);
  }
}

async function activar(req, res, next) {
  try {
    const rol = await Rol.findByPk(req.params.id);
    if (!rol) throw new HttpError(404, 'Rol no encontrado.');

    await rol.update({ activo: true });
    await registrarAuditoria({ req, accion: 'activar_rol', entidad: 'roles', entidadId: rol.id });
    res.json({ data: rol });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Código', key: 'codigo' },
  { header: 'Nombre', key: 'nombre' },
  { header: 'Descripción', key: 'descripcion' },
  { header: 'Sistema', key: 'es_sistema' },
  { header: 'Activo', key: 'activo' },
];

async function exportData(req, res, next) {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const rows = (await Rol.findAll()).map((r) => r.get({ plain: true }));
    await registrarAuditoria({ req, accion: 'exportar_roles', entidad: 'roles', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Roles');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="roles.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="roles.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getOne, create, update, inactivar, activar, exportData, crearRolSchema, actualizarRolSchema };
