const { HttpError } = require('../middlewares/errorHandler');
const { toCsv, toXlsxBuffer } = require('./exporter');
const { registrarAuditoria } = require('../middlewares/audit');

// Fábrica de controladores CRUD + exportación para catálogos y entidades
// simples (categorías, cursos, competencias, empresas, etc.). Reduce
// duplicación manteniendo el mismo patrón de seguridad en todos: validación
// previa (middleware validate), auditoría de mutaciones y exportación con
// columnas explícitas (nunca "SELECT *" hacia el archivo).
//
// DECISIÓN DE PRODUCTO/SEGURIDAD: este sistema NUNCA borra registros de
// negocio de forma física desde la API. Borrar en cascada a un colaborador,
// una empresa o un curso con historial asociado (citas, comisiones,
// evaluaciones) sería destructivo e irreversible, y en varios países viola
// obligaciones de conservación de datos laborales/SST. En su lugar, toda
// entidad "eliminable" se INACTIVA (campo `activo=false`), lo que:
//   - preserva la integridad referencial y el historial para auditoría,
//   - permite revertir el error de un clic ("reactivar"),
//   - sigue ocultando el registro de los listados operativos por defecto.
// Por eso esta fábrica NO expone ningún método de `destroy()`.
function crudFactory({ model, entidad, exportColumns, defaultOptions = {}, tieneActivo = true }) {
  return {
    async list(req, res, next) {
      try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);

        // Por defecto solo se listan los registros activos; `?incluirInactivos=true`
        // permite a un administrador ver también los inactivados (para poder
        // reactivarlos), sin que aparezcan mezclados en el flujo operativo normal.
        const where = { ...(defaultOptions.where || {}) };
        if (tieneActivo && req.query.incluirInactivos !== 'true') {
          where.activo = true;
        }

        // ADVERTENCIA para quien use esta fábrica con un catálogo nuevo:
        // NUNCA pases `defaultOptions.include` de una tabla relacionada que
        // también tenga columna `id` — `include` + `order:[['id',...]]` en
        // la misma consulta ya causó relaciones no pobladas (datos en
        // blanco de forma intermitente, sin excepción) en varios módulos de
        // este proyecto (ver empresaController, usuariosController,
        // especialistasAdminController, rolesController — todos corregidos
        // separando la consulta padre de las consultas de las relaciones y
        // combinando en memoria con un Map). Ningún caller actual de
        // `crudFactory` pasa `include`, así que hoy no está explotado, pero
        // el próximo catálogo que lo necesite NO debe usar este atajo.
        const { rows, count } = await model.findAndCountAll({
          ...defaultOptions,
          where,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          order: [['id', 'DESC']],
        });
        res.json({ data: rows, total: count, page, pageSize });
      } catch (err) {
        next(err);
      }
    },

    async getOne(req, res, next) {
      try {
        const item = await model.findByPk(req.params.id, defaultOptions);
        if (!item) throw new HttpError(404, `${entidad} no encontrado.`);
        res.json({ data: item });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const item = await model.create(req.body);
        await registrarAuditoria({ req, accion: `crear_${entidad}`, entidad, entidadId: item.id });
        res.status(201).json({ data: item });
      } catch (err) {
        next(err);
      }
    },

    async update(req, res, next) {
      try {
        const item = await model.findByPk(req.params.id);
        if (!item) throw new HttpError(404, `${entidad} no encontrado.`);
        // `activo` se gestiona con los endpoints dedicados de activar/inactivar
        // (con su propio registro de auditoría semántico); una edición normal
        // no debe poder colarlo por accidente.
        const { activo, ...camposEditables } = req.body;
        await item.update(camposEditables);
        await registrarAuditoria({ req, accion: `actualizar_${entidad}`, entidad, entidadId: item.id, detalles: camposEditables });
        res.json({ data: item });
      } catch (err) {
        next(err);
      }
    },

    // Reemplaza el antiguo "eliminar": desactiva el registro (soft) en vez
    // de borrarlo. `activo=false` lo saca de los listados operativos y de
    // los selectores en cascada, sin perder el historial ni romper FKs.
    async inactivar(req, res, next) {
      try {
        const item = await model.findByPk(req.params.id);
        if (!item) throw new HttpError(404, `${entidad} no encontrado.`);
        if (!tieneActivo) throw new HttpError(400, `${entidad} no admite inactivación.`);

        await item.update({ activo: false });
        await registrarAuditoria({ req, accion: `inactivar_${entidad}`, entidad, entidadId: item.id });
        res.json({ data: item });
      } catch (err) {
        next(err);
      }
    },

    async activar(req, res, next) {
      try {
        const item = await model.findByPk(req.params.id);
        if (!item) throw new HttpError(404, `${entidad} no encontrado.`);
        if (!tieneActivo) throw new HttpError(400, `${entidad} no admite activación.`);

        await item.update({ activo: true });
        await registrarAuditoria({ req, accion: `activar_${entidad}`, entidad, entidadId: item.id });
        res.json({ data: item });
      } catch (err) {
        next(err);
      }
    },

    async exportData(req, res, next) {
      try {
        const format = (req.query.format || 'csv').toLowerCase();
        const rows = await model.findAll(defaultOptions);
        const plain = rows.map((r) => r.get({ plain: true }));

        await registrarAuditoria({ req, accion: `exportar_${entidad}`, entidad, detalles: { formato: format, total: plain.length } });

        if (format === 'xlsx') {
          const buffer = await toXlsxBuffer(plain, exportColumns, entidad);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${entidad}.xlsx"`);
          return res.send(buffer);
        }

        const csv = toCsv(plain, exportColumns);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${entidad}.csv"`);
        return res.send(csv);
      } catch (err) {
        return next(err);
      }
    },
  };
}

module.exports = { crudFactory };
