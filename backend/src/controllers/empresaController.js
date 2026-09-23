const { z } = require('zod');
const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize,
  Colaborador,
  Usuario,
  Cita,
  Especialista,
  InscripcionCurso,
  InscripcionCursoVideo,
  CursoVideo,
  CursoPregunta,
  Curso,
  Evaluacion,
  EvaluacionCompetencia,
  EvaluacionPregunta,
  EvaluacionRespuesta,
  Competencia,
  TipoEvaluacion,
  PlanDesarrollo,
  EncuestaClima,
  EncuestaPregunta,
  EncuestaRespuesta,
  ObjetivoOkr,
} = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');
const logger = require('../utils/logger');

// Todas las consultas de este controlador filtran SIEMPRE por la empresa del
// usuario autenticado (excepto SUPER_ADMIN), evitando que un admin de RRHH
// de la Empresa A pueda ver datos de la Empresa B cambiando un parámetro.
function empresaScope(req) {
  return req.user.rol === 'SUPER_ADMIN' ? req.query.empresaId ?? null : req.user.empresaId;
}

async function especialistasMasSolicitados(whereEmpresa) {
  // Se evita mezclar GROUP BY con un include de otra tabla en la misma
  // consulta: MySQL 8 (sql_mode ONLY_FULL_GROUP_BY) rechaza columnas en el
  // SELECT que no estén ni agregadas ni en el GROUP BY cuando vienen de una
  // tabla incluida. Se resuelve en dos pasos: primero se agrupan los IDs,
  // luego se enriquecen con los datos del especialista.
  const conteos = await Cita.findAll({
    where: whereEmpresa,
    attributes: ['especialista_id', [fn('COUNT', col('id')), 'total']],
    group: ['especialista_id'],
    order: [[literal('total'), 'DESC']],
    limit: 5,
    raw: true,
  });

  if (conteos.length === 0) return [];

  const especialistas = await Especialista.findAll({
    where: { id: conteos.map((c) => c.especialista_id) },
    attributes: ['id', 'especialidad'],
  });
  const porId = new Map(especialistas.map((e) => [e.id, e.especialidad]));

  return conteos.map((c) => ({
    especialidad: porId.get(c.especialista_id) || 'Sin especialidad',
    totalCitas: Number(c.total),
  }));
}

async function dashboard(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const whereEmpresa = empresaId ? { empresa_id: empresaId } : {};

    const [totalColaboradores, citasCompletadas, progresoCursos, evaluacionesCerradas, especialistasTop] = await Promise.all([
      Colaborador.count({ where: whereEmpresa }),
      Cita.count({ where: { ...whereEmpresa, estado: 'completada' } }),
      InscripcionCurso.findAll({
        include: [{ model: Colaborador, where: whereEmpresa, attributes: [] }],
        attributes: [[fn('AVG', col('progreso_pct')), 'promedio']],
        raw: true,
      }).catch(() => [{ promedio: 0 }]),
      Evaluacion.count({ where: { ...whereEmpresa, estado: 'cerrada' } }),
      especialistasMasSolicitados(whereEmpresa).catch(() => []),
    ]);

    // Indicador de clima organizacional: promedio de respuestas de tipo escala_1_5
    // en encuestas activas/cerradas de la empresa, normalizado a base 5.0.
    const climaPromedio = await EncuestaRespuesta.findAll({
      attributes: [[fn('AVG', col('EncuestaRespuesta.valor')), 'promedio']],
      include: [
        { model: EncuestaPregunta, attributes: [], where: { tipo: 'escala_1_5' }, include: [{ model: EncuestaClima, attributes: [], where: whereEmpresa }] },
      ],
      raw: true,
    }).catch(() => [{ promedio: null }]);

    res.json({
      data: {
        totalColaboradores,
        citasCompletadas,
        horasCapacitacionPromedio: Number(progresoCursos[0]?.promedio || 0).toFixed(1),
        evaluacionesCerradas,
        climaOrganizacional: climaPromedio[0]?.promedio ? Number(climaPromedio[0].promedio).toFixed(1) : 'Sin datos',
        especialistasMasSolicitados: especialistasTop,
      },
    });
  } catch (err) {
    next(err);
  }
}

// --- Directorio de Colaboradores (gestión de RRHH sobre su propia empresa) ---

async function listarColaboradores(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
    const where = empresaId ? { empresa_id: empresaId } : {};

    // Antes esto usaba `Colaborador.findAndCountAll({ include: [Usuario],
    // order: [['id','DESC']] })`: Colaborador y Usuario tienen ambas columna
    // `id` y ordenar por `id` en la consulta padre mientras se hace
    // `include` de una tabla que también tiene `id` es el mismo patrón que
    // ya causó datos no poblados en otros módulos de este proyecto (ver
    // empresaController.listarOkrs, comisionesController.list) — acá el
    // síntoma sería el directorio principal de RRHH mostrando nombre/email
    // en blanco para algunos colaboradores, de forma intermitente. Se separa
    // en dos consultas + Map en memoria.
    const { rows: colaboradores, count } = await Colaborador.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['id', 'DESC']],
    });
    const usuarioIds = colaboradores.map((c) => c.usuario_id);
    const usuarios = usuarioIds.length
      ? await Usuario.findAll({ where: { id: usuarioIds }, attributes: ['id', 'nombre', 'email', 'estado', 'telefono'] })
      : [];
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
    const rows = colaboradores.map((c) => {
      const plano = c.get({ plain: true });
      return { ...plano, Usuario: usuarioPorId.get(plano.usuario_id) || null };
    });
    res.json({ data: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
}

const colaboradorExportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Cargo', key: 'cargo' },
  { header: 'Área', key: 'area' },
  { header: 'Fecha de ingreso', key: 'fecha_ingreso' },
];

async function exportarColaboradores(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const format = (req.query.format || 'csv').toLowerCase();
    const where = empresaId ? { empresa_id: empresaId } : {};
    const filas = await Colaborador.findAll({ where, include: [{ model: Usuario, attributes: ['nombre', 'email'] }] });
    const rows = filas.map((c) => ({
      id: c.id,
      cargo: c.cargo,
      area: c.area,
      fecha_ingreso: c.fecha_ingreso,
      nombre: c.Usuario?.nombre,
      email: c.Usuario?.email,
    }));
    const columnas = [
      { header: 'ID', key: 'id' },
      { header: 'Nombre', key: 'nombre' },
      { header: 'Email', key: 'email' },
      ...colaboradorExportColumns.slice(1),
    ];

    await registrarAuditoria({ req, accion: 'exportar_colaboradores', entidad: 'colaboradores', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, columnas, 'Colaboradores');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="colaboradores.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, columnas);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="colaboradores.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

// Progreso de cursos de un colaborador puntual: le permite a RRHH ver en
// qué va (videos vistos, intentos de evaluación, si aprobó) y, si se quedó
// sin intentos por una mala racha o un error real, reiniciarle los
// intentos de esa evaluación puntual — antes no existía ninguna forma de
// hacer esto sin tocar la base de datos a mano.
async function cursosDeColaborador(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const colaborador = await Colaborador.findOne({ where: { id: req.params.id, ...(empresaId ? { empresa_id: empresaId } : {}) } });
    if (!colaborador) throw new HttpError(404, 'Colaborador no encontrado en tu empresa.');

    // Antes: `include` de Curso Y de InscripcionCursoVideo (las dos con
    // columna `id`) junto con `order:[['id','DESC']]` en la consulta padre
    // — mismo patrón de relaciones no pobladas ya visto en otros módulos.
    // Aquí el síntoma sería el progreso del curso de un colaborador
    // mostrando 0 videos vistos o sin título, de forma intermitente.
    const inscripciones = await InscripcionCurso.findAll({
      where: { colaborador_id: colaborador.id },
      order: [['id', 'DESC']],
    });
    const cursoIds = [...new Set(inscripciones.map((i) => i.curso_id))];
    const inscripcionIds = inscripciones.map((i) => i.id);
    const [cursos, videosVistos] = await Promise.all([
      cursoIds.length ? Curso.findAll({ where: { id: cursoIds }, attributes: ['id', 'titulo', 'max_intentos_evaluacion'] }) : [],
      inscripcionIds.length
        ? InscripcionCursoVideo.findAll({ where: { inscripcion_id: inscripcionIds }, attributes: ['inscripcion_id', 'curso_video_id'] })
        : [],
    ]);
    const cursoPorId = new Map(cursos.map((c) => [c.id, c]));
    const videosPorInscripcion = new Map();
    videosVistos.forEach((v) => {
      const lista = videosPorInscripcion.get(v.inscripcion_id) || [];
      lista.push(v);
      videosPorInscripcion.set(v.inscripcion_id, lista);
    });
    const data = inscripciones.map((i) => {
      const plano = i.get({ plain: true });
      return {
        ...plano,
        Curso: cursoPorId.get(plano.curso_id) || null,
        InscripcionCursoVideos: videosPorInscripcion.get(plano.id) || [],
      };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function reiniciarEvaluacionCurso(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const colaborador = await Colaborador.findOne({ where: { id: req.params.id, ...(empresaId ? { empresa_id: empresaId } : {}) } });
    if (!colaborador) throw new HttpError(404, 'Colaborador no encontrado en tu empresa.');

    const inscripcion = await InscripcionCurso.findOne({ where: { id: req.params.inscripcionId, colaborador_id: colaborador.id } });
    if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
    if (inscripcion.estado === 'completado') throw new HttpError(409, 'Este curso ya está completado; no hace falta reiniciar la evaluación.');

    await inscripcion.update({ quiz_intentos: 0 });
    await registrarAuditoria({
      req,
      accion: 'reiniciar_evaluacion_curso',
      entidad: 'inscripciones_cursos',
      entidadId: inscripcion.id,
      detalles: { colaboradorId: colaborador.id },
    });
    res.json({ data: inscripcion });
  } catch (err) {
    next(err);
  }
}

// --- Módulo de Desempeño (Evaluaciones) ---

// Una pregunta 'si_no' o 'numerica' necesita su respuesta correcta marcada
// de antemano por el evaluador (para autocalificar); 'texto_libre' nunca la
// tiene, porque no existe una única respuesta "correcta" posible.
const evaluacionPreguntaSchema = z
  .object({
    tipo: z.enum(['si_no', 'numerica', 'texto_libre']),
    texto: z.string().min(3).max(500),
    puntos: z.coerce.number().min(0.1).max(100).default(1),
    respuestaCorrectaSiNo: z.coerce.boolean().optional(),
    respuestaCorrectaNumerica: z.coerce.number().optional(),
  })
  .refine((p) => p.tipo !== 'si_no' || typeof p.respuestaCorrectaSiNo === 'boolean', {
    message: 'Las preguntas de sí/no requieren marcar cuál es la respuesta correcta.',
    path: ['respuestaCorrectaSiNo'],
  })
  .refine((p) => p.tipo !== 'numerica' || typeof p.respuestaCorrectaNumerica === 'number', {
    message: 'Las preguntas numéricas requieren la respuesta correcta.',
    path: ['respuestaCorrectaNumerica'],
  });

const crearEvaluacionSchema = z.object({
  body: z
    .object({
      colaboradorId: z.coerce.number().int().positive(),
      tipoEvaluacionId: z.coerce.number().int().positive(),
      periodo: z.string().min(4).max(20),
      competencias: z
        .array(
          z.object({
            competenciaId: z.coerce.number().int().positive(),
            puntaje: z.coerce.number().int().min(1).max(5),
            comentario: z.string().max(500).optional(),
          })
        )
        .optional()
        .default([]),
      // Cuestionario opcional: si viene con al menos una pregunta, la
      // evaluación nace 'abierta' (pendiente de que el colaborador la
      // responda) en vez de calificada de una vez por el evaluador.
      preguntas: z.array(evaluacionPreguntaSchema).max(50).optional().default([]),
    })
    .strict()
    .refine((b) => b.competencias.length > 0 || b.preguntas.length > 0, {
      message: 'Agrega al menos una competencia calificada o una pregunta de cuestionario.',
      path: ['competencias'],
    }),
  query: z.any(),
  params: z.any(),
});

async function crearEvaluacion(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const empresaId = empresaScope(req);
    const colaborador = await Colaborador.findOne({ where: { id: req.body.colaboradorId, empresa_id: empresaId }, transaction: t });
    if (!colaborador) throw new HttpError(404, 'Colaborador no encontrado en tu empresa.');

    const preguntas = req.body.preguntas || [];
    const tieneCuestionario = preguntas.length > 0;
    const requiereCalificacionManual = preguntas.some((p) => p.tipo === 'texto_libre');
    const puntosTotales = preguntas.reduce((sum, p) => sum + Number(p.puntos), 0);

    const evaluacion = await Evaluacion.create(
      {
        empresa_id: empresaId,
        colaborador_id: colaborador.id,
        evaluador_id: req.user.id,
        tipo_evaluacion_id: req.body.tipoEvaluacionId,
        periodo: req.body.periodo,
        // Con cuestionario: pendiente de que el colaborador responda. Sin
        // cuestionario (solo competencias, flujo original): el evaluador ya
        // calificó todo en este mismo request, así que queda cerrada.
        estado: tieneCuestionario ? 'abierta' : 'cerrada',
        fecha_cierre: tieneCuestionario ? null : new Date(),
        puntos_totales: tieneCuestionario ? puntosTotales : null,
        requiere_calificacion_manual: requiereCalificacionManual,
      },
      { transaction: t }
    );

    if (tieneCuestionario) {
      await EvaluacionPregunta.bulkCreate(
        preguntas.map((p, idx) => ({
          evaluacion_id: evaluacion.id,
          tipo: p.tipo,
          texto: p.texto,
          orden: idx,
          puntos: p.puntos,
          respuesta_correcta_si_no: p.tipo === 'si_no' ? p.respuestaCorrectaSiNo : null,
          respuesta_correcta_numerica: p.tipo === 'numerica' ? p.respuestaCorrectaNumerica : null,
        })),
        { transaction: t }
      );
    }

    if (req.body.competencias.length) {
      await EvaluacionCompetencia.bulkCreate(
        req.body.competencias.map((c) => ({ evaluacion_id: evaluacion.id, competencia_id: c.competenciaId, puntaje: c.puntaje, comentario: c.comentario })),
        { transaction: t }
      );

      // Automatización del Plan Individual de Desarrollo (PID): toda
      // competencia con puntaje <= 2 genera automáticamente una acción sugerida.
      const gaps = req.body.competencias.filter((c) => c.puntaje <= 2);
      if (gaps.length) {
        const competenciasInfo = await Competencia.findAll({ where: { id: gaps.map((g) => g.competenciaId) }, transaction: t });
        await PlanDesarrollo.bulkCreate(
          gaps.map((g) => {
            const nombre = competenciasInfo.find((c) => c.id === g.competenciaId)?.nombre || 'Competencia';
            return {
              evaluacion_id: evaluacion.id,
              colaborador_id: colaborador.id,
              gap_detectado: nombre,
              accion: 'curso',
              estado: 'sugerido',
            };
          }),
          { transaction: t }
        );
      }
    }

    await t.commit();
    await registrarAuditoria({ req, accion: 'crear_evaluacion', entidad: 'evaluaciones', entidadId: evaluacion.id });
    res.status(201).json({ data: evaluacion });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// Igual que `preguntasPorEncuesta` en Clima: NUNCA se usa `include` de
// Sequelize para EvaluacionPregunta/EvaluacionRespuesta junto a un `order`
// en el padre — el mismo bug de resolución de JOIN que dejaba las
// encuestas de clima en "0 preguntas" aplica aquí (ambas tablas tienen
// columna `id`). Se resuelve siempre con queries separadas + agrupación en
// JS, que es la forma que sí funciona de manera confiable.
async function preguntasYRespuestasPorEvaluacion(evaluacionIds) {
  if (!evaluacionIds.length) return { preguntasPorId: new Map(), respuestasPorId: new Map() };
  const [preguntas, respuestas] = await Promise.all([
    EvaluacionPregunta.findAll({ where: { evaluacion_id: evaluacionIds }, order: [['orden', 'ASC']] }),
    EvaluacionRespuesta.findAll({ where: { evaluacion_id: evaluacionIds } }),
  ]);
  const preguntasPorId = new Map();
  for (const p of preguntas) {
    const lista = preguntasPorId.get(p.evaluacion_id) || [];
    lista.push(p);
    preguntasPorId.set(p.evaluacion_id, lista);
  }
  const respuestasPorId = new Map();
  for (const r of respuestas) {
    const lista = respuestasPorId.get(r.evaluacion_id) || [];
    lista.push(r);
    respuestasPorId.set(r.evaluacion_id, lista);
  }
  return { preguntasPorId, respuestasPorId };
}

// Antes esto usaba `Evaluacion.findAll({ include: [Colaborador→Usuario,
// TipoEvaluacion, EvaluacionCompetencia→Competencia, PlanDesarrollo→Curso],
// order: [['id','DESC']] })`: CUATRO includes (varios anidados), todos con
// columna `id` propia, junto con `order:[['id','DESC']]` en la consulta
// padre — el mismo patrón que ya causó relaciones no pobladas en otros
// módulos de este proyecto, aquí multiplicado por 4 relaciones distintas.
// Síntoma esperado: la pantalla de Evaluaciones de RRHH mostrando el
// nombre del colaborador, el tipo de evaluación o el plan de desarrollo en
// blanco de forma intermitente. Se separan las consultas por relación y se
// combinan en memoria con Maps.
async function conRelacionesDeEvaluaciones(evaluaciones) {
  const colaboradorIds = [...new Set(evaluaciones.map((e) => e.colaborador_id))];
  const tipoIds = [...new Set(evaluaciones.map((e) => e.tipo_evaluacion_id).filter(Boolean))];
  const evaluacionIds = evaluaciones.map((e) => e.id);

  const [colaboradores, tipos, evalCompetencias, planes] = await Promise.all([
    colaboradorIds.length
      ? Colaborador.findAll({ where: { id: colaboradorIds }, include: [{ model: Usuario, attributes: ['nombre'] }] })
      : [],
    tipoIds.length ? TipoEvaluacion.findAll({ where: { id: tipoIds } }) : [],
    evaluacionIds.length ? EvaluacionCompetencia.findAll({ where: { evaluacion_id: evaluacionIds } }) : [],
    evaluacionIds.length ? PlanDesarrollo.findAll({ where: { evaluacion_id: evaluacionIds } }) : [],
  ]);

  const competenciaIds = [...new Set(evalCompetencias.map((ec) => ec.competencia_id))];
  const cursoIds = [...new Set(planes.map((p) => p.curso_id).filter(Boolean))];
  const [competencias, cursos] = await Promise.all([
    competenciaIds.length ? Competencia.findAll({ where: { id: competenciaIds } }) : [],
    cursoIds.length ? Curso.findAll({ where: { id: cursoIds }, attributes: ['id', 'titulo'] }) : [],
  ]);

  const colaboradorPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
  const competenciaPorId = new Map(competencias.map((c) => [c.id, c]));
  const cursoPorId = new Map(cursos.map((c) => [c.id, c]));

  const evalCompetenciasPorEvaluacion = new Map();
  evalCompetencias.forEach((ec) => {
    const plano = ec.get({ plain: true });
    const conCompetencia = { ...plano, Competencia: competenciaPorId.get(plano.competencia_id) || null };
    const lista = evalCompetenciasPorEvaluacion.get(plano.evaluacion_id) || [];
    lista.push(conCompetencia);
    evalCompetenciasPorEvaluacion.set(plano.evaluacion_id, lista);
  });

  const planesPorEvaluacion = new Map();
  planes.forEach((p) => {
    const plano = p.get({ plain: true });
    const conCurso = { ...plano, Curso: plano.curso_id ? cursoPorId.get(plano.curso_id) || null : null };
    const lista = planesPorEvaluacion.get(plano.evaluacion_id) || [];
    lista.push(conCurso);
    planesPorEvaluacion.set(plano.evaluacion_id, lista);
  });

  return evaluaciones.map((e) => ({
    ...e.get({ plain: true }),
    Colaborador: colaboradorPorId.get(e.colaborador_id) || null,
    TipoEvaluacion: tipoPorId.get(e.tipo_evaluacion_id) || null,
    EvaluacionCompetencias: evalCompetenciasPorEvaluacion.get(e.id) || [],
    PlanDesarrollos: planesPorEvaluacion.get(e.id) || [],
  }));
}

async function listarEvaluaciones(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const evaluaciones = await Evaluacion.findAll({
      where: empresaId ? { empresa_id: empresaId } : {},
      order: [['id', 'DESC']],
    });
    const conRelaciones = await conRelacionesDeEvaluaciones(evaluaciones);
    const { preguntasPorId, respuestasPorId } = await preguntasYRespuestasPorEvaluacion(evaluaciones.map((e) => e.id));
    const data = conRelaciones.map((e) => {
      const preguntas = preguntasPorId.get(e.id) || [];
      const respuestas = respuestasPorId.get(e.id) || [];
      // RRHH necesita ver también cuántas respuestas de texto libre siguen
      // sin calificar, para saber si el botón "Calificar" tiene sentido.
      const pendientesCalificar = respuestas.filter((r) => !r.calificada).length;
      return { ...e, EvaluacionPreguntas: preguntas, EvaluacionRespuestas: respuestas, pendientesCalificar };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

const calificarEvaluacionSchema = z.object({
  body: z
    .object({
      respuestas: z
        .array(
          z.object({
            respuestaId: z.coerce.number().int().positive(),
            puntosObtenidos: z.coerce.number().min(0),
            comentario: z.string().max(500).optional(),
          })
        )
        .min(1),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

// Califica manualmente las respuestas de texto libre pendientes de una
// evaluación. Cuando ya no queda ninguna respuesta sin calificar, cierra la
// evaluación (estado 'cerrada') y calcula `nota_final` = nota_parcial (ya
// autocalificada al responder) + los puntos recién asignados a texto libre.
// Antes de eso, la nota NUNCA es visible para el colaborador.
async function calificarRespuestasEvaluacion(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const empresaId = empresaScope(req);
    const evaluacion = await Evaluacion.findOne({ where: { id: req.params.id, ...(empresaId ? { empresa_id: empresaId } : {}) }, transaction: t });
    if (!evaluacion) throw new HttpError(404, 'Evaluación no encontrada en tu empresa.');
    if (!evaluacion.requiere_calificacion_manual) {
      throw new HttpError(400, 'Esta evaluación no tiene preguntas de texto libre por calificar.');
    }

    const respuestas = await EvaluacionRespuesta.findAll({ where: { evaluacion_id: evaluacion.id }, transaction: t });
    const porId = new Map(respuestas.map((r) => [r.id, r]));

    for (const item of req.body.respuestas) {
      const respuesta = porId.get(item.respuestaId);
      if (!respuesta || respuesta.evaluacion_id !== evaluacion.id) {
        throw new HttpError(404, `La respuesta ${item.respuestaId} no pertenece a esta evaluación.`);
      }
      const pregunta = await EvaluacionPregunta.findByPk(respuesta.pregunta_id, { transaction: t });
      if (pregunta && Number(item.puntosObtenidos) > Number(pregunta.puntos)) {
        throw new HttpError(400, `Los puntos de "${pregunta.texto}" no pueden superar el máximo de la pregunta (${pregunta.puntos}).`);
      }
      await respuesta.update(
        { puntos_obtenidos: item.puntosObtenidos, calificada: true, comentario_evaluador: item.comentario || null },
        { transaction: t }
      );
    }

    const respuestasActualizadas = await EvaluacionRespuesta.findAll({ where: { evaluacion_id: evaluacion.id }, transaction: t });
    const quedanPendientes = respuestasActualizadas.some((r) => !r.calificada);

    if (!quedanPendientes) {
      const notaFinal = respuestasActualizadas.reduce((sum, r) => sum + Number(r.puntos_obtenidos || 0), 0);
      await evaluacion.update({ estado: 'cerrada', nota_final: notaFinal, fecha_cierre: new Date() }, { transaction: t });
    }

    await t.commit();
    await registrarAuditoria({ req, accion: 'calificar_evaluacion', entidad: 'evaluaciones', entidadId: evaluacion.id });
    res.json({ data: { cerrada: !quedanPendientes } });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// Actualiza el estado de una acción del Plan Individual de Desarrollo
// (sugerido -> en_progreso -> completado). El PID se genera automáticamente
// al crear una evaluación con competencias en gap (ver crearEvaluacion),
// pero hasta ahora quedaba solo como texto: sin esto, RRHH no tenía forma
// de dar seguimiento a si el colaborador realmente hizo el curso/reto sugerido.
const actualizarPidSchema = z.object({
  body: z
    .object({
      estado: z.enum(['sugerido', 'en_progreso', 'completado']).optional(),
      // `null` explícito quita el curso asignado; `undefined` (campo
      // ausente) deja el que ya tenía sin tocarlo.
      cursoId: z.coerce.number().int().positive().nullable().optional(),
    })
    .strict()
    .refine((b) => b.estado !== undefined || b.cursoId !== undefined, { message: 'Debes enviar al menos estado o cursoId.' }),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function actualizarPid(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const plan = await PlanDesarrollo.findByPk(req.params.id, {
      include: [{ model: Colaborador, where: empresaId ? { empresa_id: empresaId } : {} }],
    });
    if (!plan) throw new HttpError(404, 'Acción del plan de desarrollo no encontrada.');

    if (req.body.estado !== undefined) plan.estado = req.body.estado;
    if (req.body.cursoId !== undefined) {
      if (req.body.cursoId !== null) {
        const curso = await Curso.findByPk(req.body.cursoId);
        if (!curso) throw new HttpError(404, 'Curso no encontrado.');
      }
      plan.curso_id = req.body.cursoId;
      plan.accion = 'curso';
    }
    await plan.save();
    await registrarAuditoria({ req, accion: 'actualizar_pid', entidad: 'planes_desarrollo', entidadId: plan.id, detalles: { estado: plan.estado, cursoId: plan.curso_id } });
    res.json({ data: plan });
  } catch (err) {
    next(err);
  }
}

// --- Módulo de Clima y Encuestas ---

const crearEncuestaSchema = z.object({
  body: z
    .object({
      titulo: z.string().min(3).max(150),
      tipo: z.enum(['felicidad', 'estres_burnout', 'liderazgo', 'clima_general']),
      anonima: z.boolean().default(true),
      fechaInicio: z.string(),
      fechaFin: z.string(),
      preguntas: z
        .array(z.object({ texto: z.string().min(3).max(500), tipo: z.enum(['escala_1_5', 'si_no', 'texto_libre']).default('escala_1_5') }))
        .min(1),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

async function crearEncuesta(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const empresaId = empresaScope(req);
    const encuesta = await EncuestaClima.create(
      {
        empresa_id: empresaId,
        titulo: req.body.titulo,
        tipo: req.body.tipo,
        anonima: req.body.anonima,
        fecha_inicio: req.body.fechaInicio,
        fecha_fin: req.body.fechaFin,
        estado: 'activa',
      },
      { transaction: t }
    );
    const preguntasCreadas = await EncuestaPregunta.bulkCreate(
      req.body.preguntas.map((p, i) => ({ encuesta_id: encuesta.id, texto: p.texto, tipo: p.tipo, orden: i })),
      { transaction: t }
    );
    await t.commit();
    logger.info('[clima] Encuesta creada', { encuestaId: encuesta.id, totalPreguntas: preguntasCreadas.length });
    await registrarAuditoria({ req, accion: 'crear_encuesta_clima', entidad: 'encuestas_clima', entidadId: encuesta.id });
    res.status(201).json({ data: encuesta });
  } catch (err) {
    await t.rollback();
    logger.error('[clima] Error al crear encuesta (rollback aplicado)', { error: err.message, body: req.body });
    next(err);
  }
}

// Trae las preguntas de un lote de encuestas en UNA sola consulta aparte
// (no como `include` de Sequelize) y las agrupa por encuesta_id.
//
// Por qué: con MySQL/MariaDB, `EncuestaClima.findAll({ include: [{ model:
// EncuestaPregunta }], order: [['id','DESC']] })` puede devolver el array
// de preguntas VACÍO para encuestas que sí tienen preguntas guardadas — se
// confirmó en producción que la misma encuesta, con el mismo id, mostraba 3
// preguntas al consultarlas directo (`EncuestaPregunta.findAll({ where:
// { encuesta_id } })`, como hace `listarPreguntasEncuesta`) pero 0 a través
// del `include`. La sospecha es un conflicto entre el `order: [['id',
// 'DESC']]` del padre y el `id` de la tabla incluida (ambas tablas tienen
// columna `id`), que en ciertas versiones de MySQL hace que el JOIN se
// resuelva mal sin llegar a lanzar un error SQL visible. En vez de perder
// tiempo afinando el `include`, se evita el problema de raíz: nunca más se
// usa `include` para EncuestaPregunta, siempre una consulta directa.
async function preguntasPorEncuesta(encuestaIds) {
  if (!encuestaIds.length) return new Map();
  const preguntas = await EncuestaPregunta.findAll({
    where: { encuesta_id: encuestaIds },
    order: [['orden', 'ASC']],
  });
  const porEncuesta = new Map();
  for (const p of preguntas) {
    const lista = porEncuesta.get(p.encuesta_id) || [];
    lista.push(p);
    porEncuesta.set(p.encuesta_id, lista);
  }
  return porEncuesta;
}

async function listarEncuestas(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const encuestas = await EncuestaClima.findAll({
      where: empresaId ? { empresa_id: empresaId } : {},
      order: [['id', 'DESC']],
    });
    const preguntasPorId = await preguntasPorEncuesta(encuestas.map((e) => e.id));
    // Se mantiene la clave `EncuestaPreguntas` (el alias que generaba el
    // `include`) para no tener que tocar el frontend, que ya lee
    // `enc.EncuestaPreguntas`.
    const data = encuestas.map((e) => ({ ...e.get({ plain: true }), EncuestaPreguntas: preguntasPorId.get(e.id) || [] }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// =============================================================================
// PREGUNTAS DE UNA ENCUESTA YA CREADA: antes solo se podían definir en el
// momento de crear la encuesta (modal "+ Nueva encuesta"); si algo salía
// mal ahí (o RRHH quería agregar/corregir una pregunta después), no había
// forma de arreglarlo sin borrar y crear la encuesta de nuevo. Esto es lo
// que de verdad permite "diligenciar una encuesta": sin preguntas, el
// colaborador no tiene nada que responder.
// =============================================================================

const encuestaPreguntaSchema = z.object({
  body: z.object({ texto: z.string().min(3).max(500), tipo: z.enum(['escala_1_5', 'si_no', 'texto_libre']).default('escala_1_5') }).strict(),
  query: z.any(),
  params: z.any(),
});

async function encuestaDeLaEmpresa(req) {
  const empresaId = empresaScope(req);
  const encuesta = await EncuestaClima.findOne({ where: { id: req.params.id, ...(empresaId ? { empresa_id: empresaId } : {}) } });
  if (!encuesta) throw new HttpError(404, 'Encuesta no encontrada.');
  return encuesta;
}

async function listarPreguntasEncuesta(req, res, next) {
  try {
    const encuesta = await encuestaDeLaEmpresa(req);
    const preguntas = await EncuestaPregunta.findAll({ where: { encuesta_id: encuesta.id }, order: [['orden', 'ASC']] });
    res.json({ data: preguntas });
  } catch (err) {
    next(err);
  }
}

async function agregarPreguntaEncuesta(req, res, next) {
  try {
    const encuesta = await encuestaDeLaEmpresa(req);
    const orden = (await EncuestaPregunta.count({ where: { encuesta_id: encuesta.id } })) + 1;
    const pregunta = await EncuestaPregunta.create({ ...req.body, encuesta_id: encuesta.id, orden });
    // Log explícito: si esto no aparece en la consola/logs/combined.log al
    // dar clic en "+ Agregar", la petición ni siquiera está llegando a este
    // controlador (backend no reiniciado, ruta vieja en caché, CORS, etc.)
    // — si aparece pero la pregunta sigue sin verse, el problema está en el
    // refresco del listado del frontend, no en el guardado.
    logger.info('[clima] Pregunta agregada', { encuestaId: encuesta.id, preguntaId: pregunta.id, texto: pregunta.texto });
    await registrarAuditoria({ req, accion: 'agregar_pregunta_encuesta', entidad: 'encuesta_preguntas', entidadId: pregunta.id });
    res.status(201).json({ data: pregunta });
  } catch (err) {
    logger.error('[clima] Error al agregar pregunta', { error: err.message, body: req.body, encuestaId: req.params.id });
    next(err);
  }
}

async function actualizarPreguntaEncuesta(req, res, next) {
  try {
    const encuesta = await encuestaDeLaEmpresa(req);
    const pregunta = await EncuestaPregunta.findOne({ where: { id: req.params.preguntaId, encuesta_id: encuesta.id } });
    if (!pregunta) throw new HttpError(404, 'Pregunta no encontrada.');
    await pregunta.update(req.body);
    await registrarAuditoria({ req, accion: 'actualizar_pregunta_encuesta', entidad: 'encuesta_preguntas', entidadId: pregunta.id });
    res.json({ data: pregunta });
  } catch (err) {
    next(err);
  }
}

async function eliminarPreguntaEncuesta(req, res, next) {
  try {
    const encuesta = await encuestaDeLaEmpresa(req);
    const pregunta = await EncuestaPregunta.findOne({ where: { id: req.params.preguntaId, encuesta_id: encuesta.id } });
    if (!pregunta) throw new HttpError(404, 'Pregunta no encontrada.');
    // Las respuestas ya guardadas a esta pregunta se borran en cascada
    // (FK ON DELETE CASCADE en encuesta_respuestas) — aceptable porque solo
    // RRHH de la propia empresa puede llegar aquí, para corregir un error
    // real en el diseño de la encuesta.
    await pregunta.destroy();
    await registrarAuditoria({ req, accion: 'eliminar_pregunta_encuesta', entidad: 'encuesta_preguntas', entidadId: pregunta.id });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

const responderEncuestaSchema = z.object({
  body: z
    .object({
      respuestas: z.array(z.object({ preguntaId: z.coerce.number().int().positive(), valor: z.string().min(1).max(500) })).min(1),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function responderEncuesta(req, res, next) {
  try {
    const encuesta = await EncuestaClima.findByPk(req.params.id);
    if (!encuesta || encuesta.estado !== 'activa') throw new HttpError(404, 'Encuesta no disponible.');

    const colaborador = await Colaborador.findOne({ where: { usuario_id: req.user.id } });
    if (!colaborador) throw new HttpError(403, 'Solo un colaborador puede responder encuestas de clima.');
    // La encuesta pertenece a una empresa específica: sin esta verificación,
    // cualquier colaborador autenticado (de cualquier empresa) podría
    // responder la encuesta de otra empresa solo adivinando su ID (IDOR).
    if (colaborador.empresa_id !== encuesta.empresa_id) throw new HttpError(403, 'Esta encuesta no pertenece a tu empresa.');

    // Si la encuesta es anónima, NUNCA se persiste el colaborador_id, ni
    // siquiera para el propio usuario que responde: es la única forma de
    // garantizar anonimato real y no solo "anonimato de interfaz".
    const colaboradorId = encuesta.anonima ? null : colaborador.id;

    if (!encuesta.anonima) {
      const yaRespondio = await EncuestaRespuesta.findOne({ where: { encuesta_id: encuesta.id, colaborador_id: colaboradorId } });
      if (yaRespondio) throw new HttpError(409, 'Ya respondiste esta encuesta.');
    }

    const preguntasValidas = await EncuestaPregunta.findAll({ where: { encuesta_id: encuesta.id }, attributes: ['id'] });
    const idsValidos = new Set(preguntasValidas.map((p) => p.id));
    if (!req.body.respuestas.every((r) => idsValidos.has(r.preguntaId))) {
      throw new HttpError(400, 'Una o más preguntas no pertenecen a esta encuesta.');
    }

    await EncuestaRespuesta.bulkCreate(
      req.body.respuestas.map((r) => ({ encuesta_id: encuesta.id, pregunta_id: r.preguntaId, colaborador_id: colaboradorId, valor: r.valor }))
    );

    res.status(201).json({ mensaje: 'Respuesta registrada. Gracias por tu participación.' });
  } catch (err) {
    next(err);
  }
}

// Cierra una encuesta (activa -> cerrada): deja de aceptar respuestas y
// habilita la consulta de resultados agregados. Nunca se "reabre" desde
// aquí para no invalidar el análisis ya hecho sobre el corte cerrado.
async function cerrarEncuesta(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const encuesta = await EncuestaClima.findOne({ where: { id: req.params.id, ...(empresaId ? { empresa_id: empresaId } : {}) } });
    if (!encuesta) throw new HttpError(404, 'Encuesta no encontrada.');
    if (encuesta.estado === 'cerrada') throw new HttpError(409, 'La encuesta ya está cerrada.');

    encuesta.estado = 'cerrada';
    await encuesta.save();
    await registrarAuditoria({ req, accion: 'cerrar_encuesta_clima', entidad: 'encuestas_clima', entidadId: encuesta.id });
    res.json({ data: encuesta });
  } catch (err) {
    next(err);
  }
}

// Resultados agregados por pregunta: promedio para escalas 1-5, conteo de
// sí/no, y las respuestas de texto libre tal cual (nunca se expone el
// colaborador_id en la respuesta, sea o no anónima la encuesta, para que
// RRHH no pueda inferir autoría cruzando texto libre con otros datos).
async function resultadosEncuesta(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const encuesta = await EncuestaClima.findOne({
      where: { id: req.params.id, ...(empresaId ? { empresa_id: empresaId } : {}) },
    });
    if (!encuesta) throw new HttpError(404, 'Encuesta no encontrada.');

    // Consulta directa, no `include` — ver el comentario en
    // `preguntasPorEncuesta` sobre por qué el `include` de Sequelize no es
    // confiable aquí.
    const preguntasEncuesta = await EncuestaPregunta.findAll({ where: { encuesta_id: encuesta.id }, order: [['orden', 'ASC']] });
    const respuestas = await EncuestaRespuesta.findAll({ where: { encuesta_id: encuesta.id }, attributes: ['pregunta_id', 'valor'] });

    const porPregunta = preguntasEncuesta.map((pregunta) => {
      const propias = respuestas.filter((r) => r.pregunta_id === pregunta.id);
      if (pregunta.tipo === 'escala_1_5') {
        const valores = propias.map((r) => Number(r.valor)).filter((v) => !Number.isNaN(v));
        const promedio = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
        return { preguntaId: pregunta.id, texto: pregunta.texto, tipo: pregunta.tipo, totalRespuestas: propias.length, promedio: promedio ? Number(promedio.toFixed(2)) : null };
      }
      if (pregunta.tipo === 'si_no') {
        const si = propias.filter((r) => r.valor.toLowerCase() === 'si' || r.valor.toLowerCase() === 'sí').length;
        const no = propias.filter((r) => r.valor.toLowerCase() === 'no').length;
        return { preguntaId: pregunta.id, texto: pregunta.texto, tipo: pregunta.tipo, totalRespuestas: propias.length, si, no };
      }
      return { preguntaId: pregunta.id, texto: pregunta.texto, tipo: pregunta.tipo, totalRespuestas: propias.length, respuestas: propias.map((r) => r.valor) };
    });

    await registrarAuditoria({ req, accion: 'ver_resultados_encuesta', entidad: 'encuestas_clima', entidadId: encuesta.id });
    res.json({ data: { encuesta: { id: encuesta.id, titulo: encuesta.titulo, anonima: encuesta.anonima, estado: encuesta.estado }, preguntas: porPregunta } });
  } catch (err) {
    next(err);
  }
}

// --- Módulo de Objetivos del Periodo (OKRs) ---
//
// Antes el colaborador tenía una pantalla para VER sus OKRs (ver
// colaboradorController.home / academia), pero no existía ningún lugar
// donde RRHH pudiera crearlos — por eso siempre aparecía "RRHH aún no ha
// definido objetivos para este periodo". Este módulo cierra ese hueco:
// RRHH crea el objetivo, lo asigna a un colaborador de su empresa y va
// actualizando su % de avance (o lo marca completado/cancelado) desde
// aquí; el colaborador solo lo consulta, nunca lo edita.
//
// Se usan dos consultas separadas (colaboradores + okrs) en vez de un
// `include`, siguiendo el mismo criterio que el resto del controlador:
// `ObjetivoOkr` y `Colaborador` tienen ambas columna `id`, y aquí sí se
// ordena por `id`, el combo exacto que en otras pantallas de este proyecto
// causó registros "desaparecidos" en silencio.
async function listarOkrs(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const whereColab = empresaId ? { empresa_id: empresaId } : {};
    if (req.query.colaboradorId) whereColab.id = req.query.colaboradorId;

    // El comentario original de esta función ya advertía sobre el
    // anti-patrón `findAll + order:[['id',...]] + include` para ObjetivoOkr
    // (por eso se combina en memoria más abajo), pero esta misma consulta
    // de Colaborador seguía teniendo el mismo problema con su `include` de
    // Usuario — se corrige igual.
    const colaboradoresBase = await Colaborador.findAll({ where: whereColab, order: [['id', 'ASC']] });
    const usuarioIds = colaboradoresBase.map((c) => c.usuario_id);
    const usuarios = usuarioIds.length
      ? await Usuario.findAll({ where: { id: usuarioIds }, attributes: ['id', 'nombre'] })
      : [];
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
    const colaboradores = colaboradoresBase.map((c) => {
      const plano = c.get({ plain: true });
      return { ...plano, Usuario: usuarioPorId.get(plano.usuario_id) || null };
    });
    const colaboradorIds = colaboradores.map((c) => c.id);

    const whereOkr = { colaborador_id: colaboradorIds.length ? colaboradorIds : [0] };
    if (req.query.periodo) whereOkr.periodo = req.query.periodo;
    const okrs = await ObjetivoOkr.findAll({ where: whereOkr, order: [['id', 'DESC']] });

    const colaboradorPorId = new Map(colaboradores.map((c) => [c.id, c]));
    const data = okrs.map((o) => {
      const plano = o.get({ plain: true });
      return { ...plano, Colaborador: colaboradorPorId.get(o.colaborador_id) || null };
    });

    res.json({ data, colaboradores });
  } catch (err) {
    next(err);
  }
}

const crearOkrSchema = z.object({
  body: z
    .object({
      colaboradorId: z.coerce.number().int().positive(),
      descripcion: z.string().min(3).max(255),
      periodo: z.string().min(2).max(20),
      progresoPct: z.coerce.number().int().min(0).max(100).optional().default(0),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

async function crearOkr(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const colaborador = await Colaborador.findOne({
      where: { id: req.body.colaboradorId, ...(empresaId ? { empresa_id: empresaId } : {}) },
    });
    if (!colaborador) throw new HttpError(404, 'Colaborador no encontrado en tu empresa.');

    const okr = await ObjetivoOkr.create({
      colaborador_id: colaborador.id,
      descripcion: req.body.descripcion,
      periodo: req.body.periodo,
      progreso_pct: req.body.progresoPct,
      estado: 'activo',
    });
    await registrarAuditoria({ req, accion: 'crear_okr', entidad: 'objetivos_okr', entidadId: okr.id });
    res.status(201).json({ data: okr });
  } catch (err) {
    next(err);
  }
}

const actualizarOkrSchema = z.object({
  body: z
    .object({
      descripcion: z.string().min(3).max(255).optional(),
      periodo: z.string().min(2).max(20).optional(),
      progresoPct: z.coerce.number().int().min(0).max(100).optional(),
      estado: z.enum(['activo', 'completado', 'cancelado']).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: 'Debes enviar al menos un campo para actualizar.' }),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function actualizarOkr(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const okr = await ObjetivoOkr.findByPk(req.params.id, {
      include: [{ model: Colaborador, where: empresaId ? { empresa_id: empresaId } : {} }],
    });
    if (!okr) throw new HttpError(404, 'Objetivo no encontrado.');

    if (req.body.descripcion !== undefined) okr.descripcion = req.body.descripcion;
    if (req.body.periodo !== undefined) okr.periodo = req.body.periodo;
    if (req.body.progresoPct !== undefined) {
      okr.progreso_pct = req.body.progresoPct;
      // Llegar a 100% marca el objetivo como completado automáticamente,
      // salvo que este mismo request ya venga con un `estado` explícito
      // (para no pisar, por ejemplo, una cancelación).
      if (req.body.progresoPct >= 100 && req.body.estado === undefined && okr.estado === 'activo') {
        okr.estado = 'completado';
      }
    }
    if (req.body.estado !== undefined) okr.estado = req.body.estado;

    await okr.save();
    await registrarAuditoria({ req, accion: 'actualizar_okr', entidad: 'objetivos_okr', entidadId: okr.id, detalles: req.body });
    res.json({ data: okr });
  } catch (err) {
    next(err);
  }
}

const okrExportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Colaborador', key: 'colaborador' },
  { header: 'Objetivo', key: 'descripcion' },
  { header: 'Periodo', key: 'periodo' },
  { header: 'Avance %', key: 'progreso_pct' },
  { header: 'Estado', key: 'estado' },
];

async function exportarOkrs(req, res, next) {
  try {
    const empresaId = empresaScope(req);
    const format = (req.query.format || 'csv').toLowerCase();
    const whereColab = empresaId ? { empresa_id: empresaId } : {};
    const colaboradores = await Colaborador.findAll({ where: whereColab, include: [{ model: Usuario, attributes: ['nombre'] }] });
    const colaboradorIds = colaboradores.map((c) => c.id);
    const colaboradorPorId = new Map(colaboradores.map((c) => [c.id, c.Usuario?.nombre || '']));

    const okrs = colaboradorIds.length
      ? await ObjetivoOkr.findAll({ where: { colaborador_id: colaboradorIds }, order: [['id', 'DESC']] })
      : [];
    const rows = okrs.map((o) => ({
      id: o.id,
      colaborador: colaboradorPorId.get(o.colaborador_id) || '',
      descripcion: o.descripcion,
      periodo: o.periodo,
      progreso_pct: o.progreso_pct,
      estado: o.estado,
    }));

    await registrarAuditoria({ req, accion: 'exportar_okrs', entidad: 'objetivos_okr', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, okrExportColumns, 'OKRs');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="okrs.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, okrExportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="okrs.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  dashboard,
  listarColaboradores,
  exportarColaboradores,
  cursosDeColaborador,
  reiniciarEvaluacionCurso,
  crearEvaluacion,
  listarEvaluaciones,
  calificarRespuestasEvaluacion,
  actualizarPid,
  crearEncuesta,
  listarEncuestas,
  listarPreguntasEncuesta,
  agregarPreguntaEncuesta,
  actualizarPreguntaEncuesta,
  eliminarPreguntaEncuesta,
  responderEncuesta,
  cerrarEncuesta,
  resultadosEncuesta,
  crearEvaluacionSchema,
  calificarEvaluacionSchema,
  actualizarPidSchema,
  crearEncuestaSchema,
  encuestaPreguntaSchema,
  responderEncuestaSchema,
  listarOkrs,
  crearOkr,
  actualizarOkr,
  exportarOkrs,
  crearOkrSchema,
  actualizarOkrSchema,
};
