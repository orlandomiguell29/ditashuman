const { z } = require('zod');
const { crudFactory } = require('../utils/crudFactory');
const { sequelize, CategoriaBienestar, CategoriaItem, Curso, CursoVideo, CursoPregunta, Competencia, TipoEvaluacion } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');

// =============================================================================
// CURSOS, COMPETENCIAS: catálogos simples, CRUD genérico vía crudFactory.
// =============================================================================

const cursos = crudFactory({
  model: Curso,
  entidad: 'cursos',
  exportColumns: [
    { header: 'ID', key: 'id' },
    { header: 'Título', key: 'titulo' },
    { header: 'Duración (hrs)', key: 'duracion_horas' },
    { header: 'Videos', key: 'videos_count' },
    { header: 'Rating', key: 'rating' },
    { header: 'Activo', key: 'activo' },
  ],
});

const cursoSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(3).max(150),
      descripcion: z.string().max(2000).optional(),
      categoriaId: z.coerce.number().int().positive().optional().nullable(),
      duracionHoras: z.coerce.number().positive().max(999.9),
      videosCount: z.coerce.number().int().min(0).max(500),
      rating: z.coerce.number().min(0).max(5).optional(),
      otorgaCertificado: z.boolean().default(true),
      maxIntentosEvaluacion: z.coerce.number().int().min(1).max(20).default(2),
    })
    .strict()
    .transform((b) => ({
      titulo: b.titulo,
      descripcion: b.descripcion,
      categoria_id: b.categoriaId ?? null,
      duracion_horas: b.duracionHoras,
      videos_count: b.videosCount,
      rating: b.rating,
      otorga_certificado: b.otorgaCertificado,
      max_intentos_evaluacion: b.maxIntentosEvaluacion,
    })),
  query: z.any(),
  params: z.any(),
});

// =============================================================================
// VIDEOS DE UN CURSO (enlaces de YouTube): CRUD anidado bajo /catalogos/cursos/:cursoId/videos.
// No usa crudFactory porque siempre filtra por curso_id (los videos no se
// listan sueltos) y el orden se recalcula al crear.
// =============================================================================

const cursoVideoSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(2).max(200),
      urlYoutube: z.string().url().max(500),
      duracionMinutos: z.coerce.number().int().min(0).max(1000).optional(),
    })
    .strict()
    .transform((b) => ({ titulo: b.titulo, url_youtube: b.urlYoutube, duracion_minutos: b.duracionMinutos })),
  query: z.any(),
  params: z.any(),
});

async function listarVideosCurso(req, res, next) {
  try {
    const videos = await CursoVideo.findAll({ where: { curso_id: req.params.cursoId }, order: [['orden', 'ASC']] });
    res.json({ data: videos });
  } catch (err) {
    next(err);
  }
}

async function crearVideoCurso(req, res, next) {
  try {
    const curso = await Curso.findByPk(req.params.cursoId);
    if (!curso) throw new HttpError(404, 'Curso no encontrado.');

    const orden = (await CursoVideo.count({ where: { curso_id: curso.id } })) + 1;
    const video = await CursoVideo.create({ ...req.body, curso_id: curso.id, orden });
    await registrarAuditoria({ req, accion: 'crear_video_curso', entidad: 'curso_videos', entidadId: video.id });
    res.status(201).json({ data: video });
  } catch (err) {
    next(err);
  }
}

async function actualizarVideoCurso(req, res, next) {
  try {
    const video = await CursoVideo.findOne({ where: { id: req.params.videoId, curso_id: req.params.cursoId } });
    if (!video) throw new HttpError(404, 'Video no encontrado.');
    await video.update(req.body);
    await registrarAuditoria({ req, accion: 'actualizar_video_curso', entidad: 'curso_videos', entidadId: video.id });
    res.json({ data: video });
  } catch (err) {
    next(err);
  }
}

async function inactivarVideoCurso(req, res, next) {
  try {
    const video = await CursoVideo.findOne({ where: { id: req.params.videoId, curso_id: req.params.cursoId } });
    if (!video) throw new HttpError(404, 'Video no encontrado.');
    await video.update({ activo: false });
    await registrarAuditoria({ req, accion: 'inactivar_video_curso', entidad: 'curso_videos', entidadId: video.id });
    res.json({ data: video });
  } catch (err) {
    next(err);
  }
}

// =============================================================================
// EVALUACIÓN FINAL DE UN CURSO (preguntas de opción múltiple): CRUD anidado
// bajo /catalogos/cursos/:cursoId/preguntas. Es lo que hace que el
// certificado no dependa solo de haber visto los videos — ver
// colaboradorController.enviarEvaluacionCurso, que es quien la califica.
// =============================================================================

const cursoPreguntaSchema = z.object({
  body: z
    .object({
      texto: z.string().min(5).max(500),
      opciones: z.array(z.string().min(1).max(200)).min(2).max(5),
      respuestaCorrecta: z.coerce.number().int().min(0),
    })
    .strict()
    .refine((b) => b.respuestaCorrecta < b.opciones.length, {
      message: 'respuestaCorrecta debe ser el índice de una de las opciones.',
      path: ['respuestaCorrecta'],
    })
    .transform((b) => ({ texto: b.texto, opciones: b.opciones, respuesta_correcta: b.respuestaCorrecta })),
  query: z.any(),
  params: z.any(),
});

async function listarPreguntasCurso(req, res, next) {
  try {
    const preguntas = await CursoPregunta.findAll({ where: { curso_id: req.params.cursoId }, order: [['orden', 'ASC']] });
    res.json({ data: preguntas });
  } catch (err) {
    next(err);
  }
}

async function crearPreguntaCurso(req, res, next) {
  try {
    const curso = await Curso.findByPk(req.params.cursoId);
    if (!curso) throw new HttpError(404, 'Curso no encontrado.');

    const orden = (await CursoPregunta.count({ where: { curso_id: curso.id } })) + 1;
    const pregunta = await CursoPregunta.create({ ...req.body, curso_id: curso.id, orden });
    await registrarAuditoria({ req, accion: 'crear_pregunta_curso', entidad: 'curso_preguntas', entidadId: pregunta.id });
    res.status(201).json({ data: pregunta });
  } catch (err) {
    next(err);
  }
}

async function actualizarPreguntaCurso(req, res, next) {
  try {
    const pregunta = await CursoPregunta.findOne({ where: { id: req.params.preguntaId, curso_id: req.params.cursoId } });
    if (!pregunta) throw new HttpError(404, 'Pregunta no encontrada.');
    await pregunta.update(req.body);
    await registrarAuditoria({ req, accion: 'actualizar_pregunta_curso', entidad: 'curso_preguntas', entidadId: pregunta.id });
    res.json({ data: pregunta });
  } catch (err) {
    next(err);
  }
}

async function inactivarPreguntaCurso(req, res, next) {
  try {
    const pregunta = await CursoPregunta.findOne({ where: { id: req.params.preguntaId, curso_id: req.params.cursoId } });
    if (!pregunta) throw new HttpError(404, 'Pregunta no encontrada.');
    await pregunta.update({ activo: false });
    await registrarAuditoria({ req, accion: 'inactivar_pregunta_curso', entidad: 'curso_preguntas', entidadId: pregunta.id });
    res.json({ data: pregunta });
  } catch (err) {
    next(err);
  }
}

const competencias = crudFactory({
  model: Competencia,
  entidad: 'competencias',
  exportColumns: [
    { header: 'ID', key: 'id' },
    { header: 'Nombre', key: 'nombre' },
    { header: 'Descripción', key: 'descripcion' },
    { header: 'Activo', key: 'activo' },
  ],
});

const competenciaSchema = z.object({
  body: z.object({ nombre: z.string().min(2).max(100), descripcion: z.string().max(255).optional() }).strict(),
  query: z.any(),
  params: z.any(),
});

// Los tipos de evaluación (90/180/270/360°) son un catálogo cerrado sin
// bandera `activo`: no se inactivan. Se exponen crear/editar por completitud
// administrativa (ej. agregar un futuro "Evaluación 720°"), siempre con
// validación estricta para no dejar la ruta sin esquema.
const tipoEvaluacionSchema = z.object({
  body: z
    .object({
      codigo: z.string().min(1).max(20),
      nombre: z.string().min(3).max(60),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

const tiposEvaluacionCtrl = crudFactory({
  model: TipoEvaluacion,
  entidad: 'tipos_evaluacion',
  tieneActivo: false,
  exportColumns: [
    { header: 'ID', key: 'id' },
    { header: 'Código', key: 'codigo' },
    { header: 'Nombre', key: 'nombre' },
  ],
});

// =============================================================================
// CATEGORÍAS DE BIENESTAR: llevan una lista de "items" anidados (ver
// mockData original: cada categoría tenía una lista de servicios). Se maneja
// con un controlador a medida (no crudFactory genérico) porque crear/editar
// implica reemplazar transaccionalmente la colección de items hijos.
// =============================================================================

const categoriaSchema = z.object({
  body: z
    .object({
      codigo: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/, 'Usa minúsculas, números y guión bajo, ej: bienestar_emocional'),
      titulo: z.string().min(2).max(100),
      icono: z.string().max(60).optional(),
      orden: z.coerce.number().int().min(0).default(0),
      items: z.array(z.string().min(1).max(100)).default([]),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

const categoriaUpdateSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(2).max(100).optional(),
      icono: z.string().max(60).optional(),
      orden: z.coerce.number().int().min(0).optional(),
      items: z.array(z.string().min(1).max(100)).optional(),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

const categoriaInclude = [{ model: CategoriaItem }];

async function listarCategorias(req, res, next) {
  try {
    const where = req.query.incluirInactivos === 'true' ? {} : { activo: true };
    const data = await CategoriaBienestar.findAll({ where, include: categoriaInclude, order: [['orden', 'ASC']] });
    res.json({ data, total: data.length });
  } catch (err) {
    next(err);
  }
}

async function obtenerCategoria(req, res, next) {
  try {
    const categoria = await CategoriaBienestar.findByPk(req.params.id, { include: categoriaInclude });
    if (!categoria) throw new HttpError(404, 'Categoría no encontrada.');
    res.json({ data: categoria });
  } catch (err) {
    next(err);
  }
}

async function crearCategoria(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { items, ...datos } = req.body;
    const categoria = await CategoriaBienestar.create(datos, { transaction: t });
    if (items.length) {
      await CategoriaItem.bulkCreate(
        items.map((nombre, i) => ({ categoria_id: categoria.id, nombre, orden: i })),
        { transaction: t }
      );
    }
    await t.commit();
    await registrarAuditoria({ req, accion: 'crear_categoria', entidad: 'categorias', entidadId: categoria.id });
    res.status(201).json({ data: await CategoriaBienestar.findByPk(categoria.id, { include: categoriaInclude }) });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function actualizarCategoria(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const categoria = await CategoriaBienestar.findByPk(req.params.id, { transaction: t });
    if (!categoria) throw new HttpError(404, 'Categoría no encontrada.');

    const { items, ...datos } = req.body;
    await categoria.update(datos, { transaction: t });

    // Si se envió `items`, se reemplaza la colección completa (borrar+crear
    // dentro de la misma transacción): más simple y predecible desde el
    // formulario del frontend que hacer un diff campo a campo.
    if (items) {
      await CategoriaItem.destroy({ where: { categoria_id: categoria.id }, transaction: t });
      if (items.length) {
        await CategoriaItem.bulkCreate(
          items.map((nombre, i) => ({ categoria_id: categoria.id, nombre, orden: i })),
          { transaction: t }
        );
      }
    }

    await t.commit();
    await registrarAuditoria({ req, accion: 'actualizar_categoria', entidad: 'categorias', entidadId: categoria.id });
    res.json({ data: await CategoriaBienestar.findByPk(categoria.id, { include: categoriaInclude }) });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function inactivarCategoria(req, res, next) {
  try {
    const categoria = await CategoriaBienestar.findByPk(req.params.id);
    if (!categoria) throw new HttpError(404, 'Categoría no encontrada.');
    await categoria.update({ activo: false });
    await registrarAuditoria({ req, accion: 'inactivar_categoria', entidad: 'categorias', entidadId: categoria.id });
    res.json({ data: categoria });
  } catch (err) {
    next(err);
  }
}

async function activarCategoria(req, res, next) {
  try {
    const categoria = await CategoriaBienestar.findByPk(req.params.id);
    if (!categoria) throw new HttpError(404, 'Categoría no encontrada.');
    await categoria.update({ activo: true });
    await registrarAuditoria({ req, accion: 'activar_categoria', entidad: 'categorias', entidadId: categoria.id });
    res.json({ data: categoria });
  } catch (err) {
    next(err);
  }
}

const categoriaExportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Código', key: 'codigo' },
  { header: 'Título', key: 'titulo' },
  { header: 'Activo', key: 'activo' },
];

async function exportarCategorias(req, res, next) {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const rows = (await CategoriaBienestar.findAll()).map((c) => c.get({ plain: true }));
    await registrarAuditoria({ req, accion: 'exportar_categorias', entidad: 'categorias', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, categoriaExportColumns, 'Categorias');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="categorias.csv"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, categoriaExportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="categorias.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  cursos,
  cursoSchema,
  cursoVideos: { list: listarVideosCurso, create: crearVideoCurso, update: actualizarVideoCurso, inactivar: inactivarVideoCurso },
  cursoVideoSchema,
  cursoPreguntas: { list: listarPreguntasCurso, create: crearPreguntaCurso, update: actualizarPreguntaCurso, inactivar: inactivarPreguntaCurso },
  cursoPreguntaSchema,
  competencias,
  competenciaSchema,
  tiposEvaluacionCtrl,
  tipoEvaluacionSchema,
  categorias: {
    list: listarCategorias,
    getOne: obtenerCategoria,
    create: crearCategoria,
    update: actualizarCategoria,
    inactivar: inactivarCategoria,
    activar: activarCategoria,
    exportData: exportarCategorias,
  },
  categoriaSchema,
  categoriaUpdateSchema,
};
