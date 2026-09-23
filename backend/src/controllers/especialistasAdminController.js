const { z } = require('zod');
const { Especialista, Usuario, CategoriaBienestar, EspecialistaHorario } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');

// =============================================================================
// Administración del marketplace de Especialistas (vista de RRHH/SUPER_ADMIN,
// distinta del portal de autogestión del propio especialista en
// especialistaController.js). El alta de un especialista se hace siempre
// desde /usuarios (crea usuario + perfil en una sola transacción); este
// módulo cubre lo que viene DESPUÉS del alta: verificación, edición de
// tarifa/comisión y activación/inactivación.
// =============================================================================

const include = [
  { model: Usuario, attributes: ['id', 'nombre', 'email', 'estado'] },
  { model: CategoriaBienestar, attributes: ['id', 'titulo'] },
];

async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
    const where = req.query.incluirInactivos === 'true' ? {} : { activo: true };

    // Antes: `include` de Usuario Y CategoriaBienestar (ambas con `id`)
    // junto con `order:[['id','DESC']]` en la consulta padre — el mismo
    // patrón que ya causó relaciones no pobladas en otros módulos de este
    // proyecto (nombre/email del especialista, o su categoría, en blanco de
    // forma intermitente en el marketplace de administración).
    const { rows: especialistas, count } = await Especialista.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['id', 'DESC']],
    });
    const usuarioIds = especialistas.map((e) => e.usuario_id);
    const categoriaIds = [...new Set(especialistas.map((e) => e.categoria_id).filter(Boolean))];
    const [usuarios, categorias] = await Promise.all([
      usuarioIds.length ? Usuario.findAll({ where: { id: usuarioIds }, attributes: ['id', 'nombre', 'email', 'estado'] }) : [],
      categoriaIds.length ? CategoriaBienestar.findAll({ where: { id: categoriaIds }, attributes: ['id', 'titulo'] }) : [],
    ]);
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
    const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
    const rows = especialistas.map((e) => {
      const plano = e.get({ plain: true });
      return {
        ...plano,
        Usuario: usuarioPorId.get(plano.usuario_id) || null,
        CategoriaBienestar: plano.categoria_id ? categoriaPorId.get(plano.categoria_id) || null : null,
      };
    });
    res.json({ data: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const especialista = await Especialista.findByPk(req.params.id, { include: [...include, { model: EspecialistaHorario }] });
    if (!especialista) throw new HttpError(404, 'Especialista no encontrado.');
    res.json({ data: especialista });
  } catch (err) {
    next(err);
  }
}

const actualizarSchema = z.object({
  body: z
    .object({
      especialidad: z.string().min(2).max(120).optional(),
      categoriaId: z.coerce.number().int().positive().nullable().optional(),
      tarifaBase: z.coerce.number().positive().max(99999999).optional(),
      pctComision: z.coerce.number().min(0).max(100).optional(),
      // Duración de las citas de este especialista, en minutos. Rango
      // 15–240: por debajo de 15 el slot ya no es útil, por encima de 240
      // casi seguro es un error de captura.
      duracionMinutos: z.coerce.number().int().min(15).max(240).optional(),
      bio: z.string().max(2000).optional(),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function update(req, res, next) {
  try {
    const especialista = await Especialista.findByPk(req.params.id);
    if (!especialista) throw new HttpError(404, 'Especialista no encontrado.');

    const { categoriaId, tarifaBase, pctComision, duracionMinutos, ...resto } = req.body;
    await especialista.update({
      ...resto,
      ...(categoriaId !== undefined ? { categoria_id: categoriaId } : {}),
      ...(tarifaBase !== undefined ? { tarifa_base: tarifaBase } : {}),
      ...(pctComision !== undefined ? { pct_comision: pctComision } : {}),
      ...(duracionMinutos !== undefined ? { duracion_minutos: duracionMinutos } : {}),
    });

    await registrarAuditoria({ req, accion: 'actualizar_especialista', entidad: 'especialistas', entidadId: especialista.id, detalles: req.body });
    res.json({ data: await Especialista.findByPk(especialista.id, { include }) });
  } catch (err) {
    next(err);
  }
}

// La verificación es una compuerta deliberadamente separada de "activo":
// un especialista puede estar activo pero aún no verificado (recién
// registrado) — mientras no esté verificado, no aparece en el marketplace
// de agendamiento del colaborador (ver colaboradorController.especialistasDisponibles,
// que filtra por verificado=true).
async function verificar(req, res, next) {
  try {
    const especialista = await Especialista.findByPk(req.params.id);
    if (!especialista) throw new HttpError(404, 'Especialista no encontrado.');

    await especialista.update({ verificado: true });
    await registrarAuditoria({ req, accion: 'verificar_especialista', entidad: 'especialistas', entidadId: especialista.id });
    res.json({ data: especialista });
  } catch (err) {
    next(err);
  }
}

async function revocarVerificacion(req, res, next) {
  try {
    const especialista = await Especialista.findByPk(req.params.id);
    if (!especialista) throw new HttpError(404, 'Especialista no encontrado.');

    await especialista.update({ verificado: false });
    await registrarAuditoria({ req, accion: 'revocar_verificacion_especialista', entidad: 'especialistas', entidadId: especialista.id });
    res.json({ data: especialista });
  } catch (err) {
    next(err);
  }
}

// Inactivar aquí NO borra al especialista ni sus comisiones/citas
// históricas; solo lo saca del marketplace y bloquea el acceso a su portal
// de autogestión (ver middlewares/auth: el login sigue funcionando, pero se
// recomienda además inactivar su Usuario si se quiere bloquear el acceso).
async function inactivar(req, res, next) {
  try {
    const especialista = await Especialista.findByPk(req.params.id);
    if (!especialista) throw new HttpError(404, 'Especialista no encontrado.');

    await especialista.update({ activo: false });
    await registrarAuditoria({ req, accion: 'inactivar_especialista', entidad: 'especialistas', entidadId: especialista.id });
    res.json({ data: especialista });
  } catch (err) {
    next(err);
  }
}

async function activar(req, res, next) {
  try {
    const especialista = await Especialista.findByPk(req.params.id);
    if (!especialista) throw new HttpError(404, 'Especialista no encontrado.');

    await especialista.update({ activo: true });
    await registrarAuditoria({ req, accion: 'activar_especialista', entidad: 'especialistas', entidadId: especialista.id });
    res.json({ data: especialista });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Especialidad', key: 'especialidad' },
  { header: 'Tarifa base', key: 'tarifa_base' },
  { header: '% Comisión', key: 'pct_comision' },
  { header: 'Duración cita (min)', key: 'duracion_minutos' },
  { header: 'Verificado', key: 'verificado' },
  { header: 'Activo', key: 'activo' },
];

async function exportData(req, res, next) {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const rows = (await Especialista.findAll()).map((e) => e.get({ plain: true }));
    await registrarAuditoria({ req, accion: 'exportar_especialistas', entidad: 'especialistas', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Especialistas');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="especialistas.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="especialistas.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getOne, update, verificar, revocarVerificacion, inactivar, activar, exportData, actualizarSchema };
