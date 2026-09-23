const { z } = require('zod');
const { Op } = require('sequelize');
const {
  sequelize,
  Colaborador,
  Usuario,
  Especialista,
  EspecialistaHorario,
  CategoriaBienestar,
  Cita,
  Curso,
  CursoVideo,
  CursoPregunta,
  InscripcionCurso,
  InscripcionCursoVideo,
  ObjetivoOkr,
  ExpedienteDocumento,
  EncuestaClima,
  EncuestaPregunta,
  EncuestaRespuesta,
  PlanDesarrollo,
  Evaluacion,
  EvaluacionPregunta,
  EvaluacionRespuesta,
  TipoEvaluacion,
} = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { generarEnlaceReunion } = require('../utils/videollamada');
const { existeSolapamiento, expirarCitasVencidas } = require('../utils/citas');
const { crearReunionMeet } = require('../utils/googleMeet');
const { correoCitaAgendada } = require('../utils/mailer');
const { generarCertificadoPdf } = require('../utils/certificados');

// Resuelve el registro de "colaborador" del usuario autenticado. Todas las
// rutas de este controlador operan SOLO sobre el propio colaborador salvo
// que el rol tenga permisos elevados (RRHH/SUPER_ADMIN), evitando IDOR
// (Insecure Direct Object Reference) por manipulación de :id en la URL.
async function miColaborador(usuarioId) {
  const colaborador = await Colaborador.findOne({ where: { usuario_id: usuarioId } });
  if (!colaborador) throw new HttpError(404, 'Perfil de colaborador no encontrado para este usuario.');
  return colaborador;
}

async function home(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const [inscripciones, proximaCita, okrs] = await Promise.all([
      InscripcionCurso.findAll({ where: { colaborador_id: colaborador.id }, include: [Curso] }),
      Cita.findOne({
        where: { colaborador_id: colaborador.id, fecha_hora: { [Op.gte]: new Date() }, estado: { [Op.in]: ['pendiente', 'confirmada'] } },
        order: [['fecha_hora', 'ASC']],
      }),
      ObjetivoOkr.findAll({ where: { colaborador_id: colaborador.id, estado: 'activo' } }),
    ]);
    res.json({ data: { colaborador, inscripciones, proximaCita, okrs } });
  } catch (err) {
    next(err);
  }
}

async function categorias(req, res, next) {
  try {
    const data = await CategoriaBienestar.findAll({
      where: { activo: true },
      include: [{ association: 'CategoriaItems' }],
      order: [['orden', 'ASC']],
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

async function especialistasDisponibles(req, res, next) {
  try {
    const { categoriaId } = req.query;
    const where = { activo: true, verificado: true };
    if (categoriaId) where.categoria_id = categoriaId;

    const data = await Especialista.findAll({
      where,
      include: [
        { model: Usuario, attributes: ['nombre'] },
        { model: EspecialistaHorario, where: { activo: true }, required: false },
      ],
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// Calcula los horarios REALES disponibles de un especialista para una fecha
// dada, a partir de su franja semanal (EspecialistaHorario.dia_semana) menos
// las citas ya confirmadas/pendientes ese día. Reemplaza el "slot demo" fijo
// que tenía el frontend (agendar siempre a las 10:00 del día siguiente).
//
// El tamaño de cada slot es `especialista.duracion_minutos` (parametrizable
// desde Admin > Especialistas, antes fijo en 60 para todos). Un slot se
// considera ocupado si se solapa con cualquier cita existente, comparando
// rangos reales (inicio/fin) y no solo la hora exacta de inicio — necesario
// porque dos especialistas, o el mismo especialista en momentos distintos,
// pueden tener duraciones distintas.
async function horariosDisponibles(req, res, next) {
  try {
    const { fecha } = req.query; // 'YYYY-MM-DD'
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new HttpError(400, 'Debes indicar una fecha válida (YYYY-MM-DD).');

    // Libera primero cualquier cita vencida que nadie haya marcado (ver
    // utils/citas.js): si no se hace esto aquí, una cita ya pasada seguiría
    // bloqueando ese horario como "ocupado" para siempre.
    await expirarCitasVencidas();

    const especialista = await Especialista.findByPk(req.params.id);
    if (!especialista || !especialista.activo || !especialista.verificado) throw new HttpError(404, 'Especialista no disponible.');

    const diaSemana = new Date(`${fecha}T12:00:00`).getDay(); // mediodía evita saltos de zona horaria
    const franjas = await EspecialistaHorario.findAll({ where: { especialista_id: especialista.id, dia_semana: diaSemana, activo: true } });
    if (!franjas.length) return res.json({ data: [] });

    const duracionMin = especialista.duracion_minutos || 60;

    const citasDelDia = await Cita.findAll({
      where: {
        especialista_id: especialista.id,
        estado: { [Op.in]: ['pendiente', 'confirmada'] },
        // Se amplía la ventana un día a cada lado por si una cita del día
        // anterior con duración larga se extiende dentro de este día (o
        // viceversa), aunque en la práctica las citas casi nunca cruzan
        // medianoche.
        fecha_hora: { [Op.gte]: new Date(`${fecha}T00:00:00`), [Op.lt]: new Date(`${fecha}T23:59:59`) },
      },
      attributes: ['fecha_hora', 'duracion_min'],
    });
    const ocupadas = citasDelDia.map((c) => {
      const inicio = new Date(c.fecha_hora).getTime();
      return { inicio, fin: inicio + (c.duracion_min || 60) * 60 * 1000 };
    });
    const seSolapa = (inicio, fin) => ocupadas.some((o) => inicio < o.fin && fin > o.inicio);

    const ahora = new Date();
    const slots = [];
    for (const franja of franjas) {
      let [h, m] = franja.hora_inicio.split(':').map(Number);
      const [hFin, mFin] = franja.hora_fin.split(':').map(Number);
      while (h < hFin || (h === hFin && m < mFin)) {
        const hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const fechaHoraSlot = new Date(`${fecha}T${hora}:00`);
        const inicioMs = fechaHoraSlot.getTime();
        const finMs = inicioMs + duracionMin * 60 * 1000;
        if (!seSolapa(inicioMs, finMs) && fechaHoraSlot > ahora) slots.push(hora);
        m += duracionMin;
        while (m >= 60) { h += 1; m -= 60; }
      }
    }

    res.json({ data: slots });
  } catch (err) {
    next(err);
  }
}

const crearCitaSchema = z.object({
  body: z
    .object({
      especialistaId: z.coerce.number().int().positive(),
      categoriaId: z.coerce.number().int().positive().optional(),
      fechaHora: z.string().datetime(),
      motivo: z.string().max(255).optional(),
      canal: z.enum(['videollamada_interna', 'zoom', 'teams', 'meet', 'presencial']).default('videollamada_interna'),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

async function agendarCita(req, res, next) {
  try {
    await expirarCitasVencidas();
    const colaborador = await miColaborador(req.user.id);
    const especialista = await Especialista.findByPk(req.body.especialistaId);
    if (!especialista || !especialista.activo) throw new HttpError(404, 'Especialista no disponible.');

    const fechaHora = new Date(req.body.fechaHora);
    if (fechaHora <= new Date()) throw new HttpError(400, 'La fecha de la cita debe ser futura.');

    const duracionMin = especialista.duracion_minutos || 60;

    // Evita doble reserva del mismo especialista: se compara el rango real
    // (inicio/fin) de la nueva cita contra el de cada cita existente, no
    // solo la hora exacta de inicio, porque la duración es parametrizable
    // por especialista y puede haber cambiado desde que se agendó una cita
    // anterior.
    if (await existeSolapamiento(especialista.id, fechaHora, duracionMin)) {
      throw new HttpError(409, 'El especialista ya tiene una cita agendada en ese horario.');
    }

    const tarifa = Number(especialista.tarifa_base);
    // Regla de negocio del convenio empresa (idéntica al mock): la empresa
    // cubre el 66.6% de la tarifa y el colaborador paga el resto.
    const cubreEmpresa = Math.round(tarifa * 0.6667 * 100) / 100;
    const pagaColaborador = Math.round((tarifa - cubreEmpresa) * 100) / 100;

    // Se resuelven los correos ANTES de crear la cita: se necesitan tanto
    // para invitar a colaborador/especialista al evento real de Google
    // Calendar (canal 'meet') como para el correo de confirmación de abajo.
    const [usuarioColaborador, especialistaConUsuario] = await Promise.all([
      Usuario.findByPk(req.user.id, { attributes: ['nombre', 'email'] }),
      Especialista.findByPk(especialista.id, { include: [{ model: Usuario, attributes: ['nombre', 'email'] }] }),
    ]);

    let enlaceReunion = null;
    if (req.body.canal === 'videollamada_interna') {
      // Sala real de Jitsi Meet generada en el momento.
      enlaceReunion = generarEnlaceReunion();
    } else if (req.body.canal === 'meet') {
      // Google Meet real vía Calendar API (ver utils/googleMeet.js) — solo
      // funciona si un SUPER_ADMIN conectó una cuenta de Google desde
      // Admin > Integraciones. Si no está conectada, se cae a Jitsi en vez
      // de fallar el agendamiento completo: el colaborador siempre debe
      // poder reservar su cita, con o sin la integración configurada.
      try {
        enlaceReunion = await crearReunionMeet({
          resumen: `Asesoría DITASH — ${especialista.especialidad}`,
          descripcion: req.body.motivo || 'Asesoría agendada desde DITASH Human+.',
          inicio: fechaHora,
          fin: new Date(fechaHora.getTime() + duracionMin * 60 * 1000),
          invitadosEmails: [usuarioColaborador?.email, especialistaConUsuario?.Usuario?.email],
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('No fue posible crear la reunión en Google Meet, se usará Jitsi como respaldo:', err.message);
      }
      if (!enlaceReunion) enlaceReunion = generarEnlaceReunion();
    }

    const cita = await Cita.create({
      colaborador_id: colaborador.id,
      especialista_id: especialista.id,
      empresa_id: colaborador.empresa_id,
      categoria_id: req.body.categoriaId ?? especialista.categoria_id,
      fecha_hora: fechaHora,
      duracion_min: duracionMin,
      canal: req.body.canal,
      enlace_reunion: enlaceReunion,
      tarifa,
      cubre_empresa: cubreEmpresa,
      paga_colaborador: pagaColaborador,
      motivo: req.body.motivo,
    });

    await registrarAuditoria({ req, accion: 'agendar_cita', entidad: 'citas', entidadId: cita.id });
    res.status(201).json({ data: cita });

    // Notificación por correo, después de responder al cliente (no debe
    // hacerlo esperar) y sin que un fallo de SMTP afecte la cita ya creada.
    // Reutiliza los datos ya obtenidos arriba (para el enlace de Meet), en
    // vez de volver a consultarlos.
    if (usuarioColaborador) {
      correoCitaAgendada({
        to: usuarioColaborador.email,
        nombreColaborador: usuarioColaborador.nombre,
        nombreEspecialista: especialistaConUsuario?.Usuario?.nombre || especialista.especialidad,
        fechaHora: cita.fecha_hora,
        enlaceReunion: cita.enlace_reunion,
      }).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
}

async function misCitas(req, res, next) {
  try {
    await expirarCitasVencidas();
    const colaborador = await miColaborador(req.user.id);
    const data = await Cita.findAll({
      where: { colaborador_id: colaborador.id },
      include: [{ model: Especialista, include: [{ model: Usuario, attributes: ['nombre'] }] }],
      order: [['fecha_hora', 'DESC']],
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// Ventana mínima de anticipación para que un colaborador cancele o reasigne
// su propia cita: por debajo de esto, un cambio de última hora le complica
// demasiado la agenda al especialista (que ya la tenía bloqueada y quizás
// rechazó otras citas por ese horario). Aplica igual a cancelar y a
// reasignar — antes solo aplicaba a reasignar, lo que dejaba cancelar una
// cita literalmente minutos antes de que empezara. El especialista SÍ puede
// cancelar/reagendar sin esta restricción — ver especialistaController.
const HORAS_MINIMAS_GESTIONAR_COLABORADOR = 24;

// Cancelar (no borrar) una cita propia. Solo procede si aún no ocurrió, no
// está ya completada/cancelada, y falta al menos
// `HORAS_MINIMAS_GESTIONAR_COLABORADOR` para la hora de la cita; deja
// rastro en `estado`, nunca se elimina el registro (se necesita para
// historial y para liberar el horario).
async function cancelarCita(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const cita = await Cita.findOne({ where: { id: req.params.id, colaborador_id: colaborador.id } });
    if (!cita) throw new HttpError(404, 'Cita no encontrada.');
    if (!['pendiente', 'confirmada'].includes(cita.estado)) throw new HttpError(409, 'Esta cita ya no puede cancelarse.');
    if (new Date(cita.fecha_hora) <= new Date()) throw new HttpError(409, 'No puedes cancelar una cita que ya pasó.');

    const horasParaLaCita = (new Date(cita.fecha_hora).getTime() - Date.now()) / (60 * 60 * 1000);
    if (horasParaLaCita < HORAS_MINIMAS_GESTIONAR_COLABORADOR) {
      throw new HttpError(409, `Solo puedes cancelar una cita con al menos ${HORAS_MINIMAS_GESTIONAR_COLABORADOR} horas de anticipación. Si es urgente, contacta directamente al especialista.`);
    }

    cita.estado = 'cancelada';
    await cita.save();
    await registrarAuditoria({ req, accion: 'cancelar_cita', entidad: 'citas', entidadId: cita.id });
    res.json({ data: cita });
  } catch (err) {
    next(err);
  }
}

const reagendarCitaSchema = z.object({
  body: z
    .object({
      fechaHora: z.string().datetime(),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function reagendarCita(req, res, next) {
  try {
    await expirarCitasVencidas();
    const colaborador = await miColaborador(req.user.id);
    const cita = await Cita.findOne({ where: { id: req.params.id, colaborador_id: colaborador.id } });
    if (!cita) throw new HttpError(404, 'Cita no encontrada.');
    if (!['pendiente', 'confirmada'].includes(cita.estado)) throw new HttpError(409, 'Esta cita ya no puede reasignarse.');

    const horasParaLaCita = (new Date(cita.fecha_hora).getTime() - Date.now()) / (60 * 60 * 1000);
    if (horasParaLaCita < HORAS_MINIMAS_GESTIONAR_COLABORADOR) {
      throw new HttpError(409, `Solo puedes reasignar una cita con al menos ${HORAS_MINIMAS_GESTIONAR_COLABORADOR} horas de anticipación.`);
    }

    const nuevaFecha = new Date(req.body.fechaHora);
    if (nuevaFecha <= new Date()) throw new HttpError(400, 'La nueva fecha de la cita debe ser futura.');

    // Conserva la duración que ya tenía la cita (fijada al agendarla según
    // la duración del especialista en ese momento) al validar el nuevo
    // horario contra el resto de la agenda.
    if (await existeSolapamiento(cita.especialista_id, nuevaFecha, cita.duracion_min, cita.id)) {
      throw new HttpError(409, 'El especialista ya tiene una cita agendada en ese horario.');
    }

    // Vuelve a 'pendiente': la confirmación anterior del especialista era
    // para la fecha/hora vieja, no para la nueva — debe volver a revisarla.
    cita.fecha_hora = nuevaFecha;
    cita.estado = 'pendiente';
    await cita.save();
    await registrarAuditoria({ req, accion: 'reagendar_cita', entidad: 'citas', entidadId: cita.id });
    res.json({ data: cita });
  } catch (err) {
    next(err);
  }
}

async function academia(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const [cursos, inscripciones] = await Promise.all([
      Curso.findAll({
        where: { activo: true },
        include: [
          { model: CursoVideo, where: { activo: true }, required: false, separate: true, order: [['orden', 'ASC']] },
          // OJO: se excluye `respuesta_correcta` a propósito — el
          // colaborador solo debe recibir la pregunta y las opciones, nunca
          // cuál es la correcta (si no, la evaluación final no evaluaría
          // nada; bastaría con leer la respuesta en el Network tab).
          {
            model: CursoPregunta,
            attributes: ['id', 'curso_id', 'texto', 'opciones', 'orden'],
            where: { activo: true },
            required: false,
            separate: true,
            order: [['orden', 'ASC']],
          },
        ],
      }),
      InscripcionCurso.findAll({
        where: { colaborador_id: colaborador.id },
        include: [{ model: InscripcionCursoVideo, attributes: ['curso_video_id'] }],
      }),
    ]);
    res.json({ data: { cursos, inscripciones } });
  } catch (err) {
    next(err);
  }
}

async function inscribirCurso(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const curso = await Curso.findByPk(req.params.cursoId);
    if (!curso) throw new HttpError(404, 'Curso no encontrado.');

    const [inscripcion, creado] = await InscripcionCurso.findOrCreate({
      where: { colaborador_id: colaborador.id, curso_id: curso.id },
      defaults: { estado: 'en_progreso', fecha_inicio: new Date() },
    });
    if (!creado) throw new HttpError(409, 'Ya estás inscrito en este curso.');

    await registrarAuditoria({ req, accion: 'inscribir_curso', entidad: 'cursos', entidadId: curso.id });
    res.status(201).json({ data: inscripcion });
  } catch (err) {
    next(err);
  }
}

const progresoSchema = z.object({
  body: z.object({ progresoPct: z.coerce.number().int().min(0).max(100) }).strict(),
  query: z.any(),
  params: z.any(),
});

const videoVistoSchema = z.object({
  body: z.object({}).strict(),
  query: z.any(),
  params: z.any(),
});

// Puntaje mínimo (%) para aprobar la evaluación final de un curso. Verlo
// completo ya no es suficiente por sí solo para obtener el certificado: es
// una condición necesaria pero no suficiente (ver evaluarFinalizacionCurso).
const PUNTAJE_MINIMO_QUIZ = 70;
// Máximo de intentos POR DEFECTO si el curso no tiene su propio valor
// configurado (ver Curso.max_intentos_evaluacion, editable desde Admin >
// Cursos). Al agotarlos sin aprobar, la evaluación queda bloqueada — RRHH
// puede reiniciar los intentos de un colaborador puntual desde Empresa >
// Colaboradores > Cursos (ver empresaController.reiniciarEvaluacionCurso).
const MAX_INTENTOS_QUIZ_DEFECTO = 2;
const maxIntentosDe = (curso) => curso?.max_intentos_evaluacion || MAX_INTENTOS_QUIZ_DEFECTO;

// El progreso de VIDEOS (0-100%) se sigue mostrando en la barra de avance
// tal cual (así el colaborador ve cuánto le falta por ver), pero el curso
// solo pasa a `completado` — con certificado — cuando además aprobó la
// evaluación final. Antes de eso, aunque haya visto el 100% de los videos,
// el estado se queda en `en_progreso` con la evaluación disponible para
// presentar. Esto es lo que hace que el certificado ya no dependa
// únicamente de "haber dado play" a todos los videos.
async function evaluarFinalizacionCurso(inscripcion) {
  const totalVideos = await CursoVideo.count({ where: { curso_id: inscripcion.curso_id, activo: true } });
  const videosVistos = await InscripcionCursoVideo.count({ where: { inscripcion_id: inscripcion.id } });
  const progresoPct = totalVideos > 0 ? Math.min(Math.round((videosVistos / totalVideos) * 100), 100) : 0;
  const todosLosVideosVistos = totalVideos > 0 && videosVistos >= totalVideos;

  // Si el curso no tiene evaluación configurada (RRHH no agregó preguntas
  // todavía), no se puede exigir aprobarla — quedaría bloqueado para
  // siempre. En ese caso el requisito de evaluación se da por cumplido y
  // el curso se completa solo con los videos, como antes.
  const tieneEvaluacion = (await CursoPregunta.count({ where: { curso_id: inscripcion.curso_id, activo: true } })) > 0;
  const evaluacionAprobada = !tieneEvaluacion || inscripcion.quiz_aprobado;

  const cambios = { progreso_pct: progresoPct };
  if (todosLosVideosVistos && evaluacionAprobada) {
    cambios.estado = 'completado';
    cambios.fecha_fin = new Date();
    if (inscripcion.Curso?.otorga_certificado) {
      cambios.certificado_url = `/colaborador/academia/inscripciones/${inscripcion.id}/certificado`;
    }
  } else if (progresoPct > 0 || inscripcion.quiz_intentos > 0) {
    cambios.estado = 'en_progreso';
  }
  return cambios;
}

// Marca un video concreto del curso como visto por el colaborador y
// recalcula el progreso real (videos vistos / total de videos del curso),
// en vez del avance simulado por clic que había antes. Ver todos los
// videos habilita la evaluación final (ver `enviarEvaluacionCurso`), que es
// la que de verdad activa el certificado.
async function marcarVideoVisto(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const inscripcion = await InscripcionCurso.findOne({
      where: { id: req.params.inscripcionId, colaborador_id: colaborador.id },
      include: [Curso],
    });
    if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
    if (inscripcion.estado === 'completado') throw new HttpError(409, 'Este curso ya está completado.');

    const video = await CursoVideo.findOne({ where: { id: req.params.videoId, curso_id: inscripcion.curso_id, activo: true } });
    if (!video) throw new HttpError(404, 'Este video no pertenece al curso.');

    await InscripcionCursoVideo.findOrCreate({
      where: { inscripcion_id: inscripcion.id, curso_video_id: video.id },
    });

    const cambios = await evaluarFinalizacionCurso(inscripcion);
    await inscripcion.update(cambios);
    await registrarAuditoria({ req, accion: 'marcar_video_visto', entidad: 'inscripciones_cursos', entidadId: inscripcion.id, detalles: { videoId: video.id, progresoPct: cambios.progreso_pct } });
    res.json({ data: inscripcion });
  } catch (err) {
    next(err);
  }
}

const evaluacionCursoSchema = z.object({
  body: z.object({
    respuestas: z.array(z.object({ preguntaId: z.coerce.number().int().positive(), opcionElegida: z.coerce.number().int().min(0) })).min(1),
  }).strict(),
  query: z.any(),
  params: z.any(),
});

// Recibe las respuestas de la evaluación final de opción múltiple, la
// califica contra `respuesta_correcta` (que nunca se le entregó al
// frontend) y, si el puntaje alcanza PUNTAJE_MINIMO_QUIZ, marca
// `quiz_aprobado`. Se permiten como máximo `curso.max_intentos_evaluacion`
// intentos (parametrizable por curso desde Admin > Cursos): al agotarlos
// sin aprobar, el endpoint rechaza nuevos envíos.
async function enviarEvaluacionCurso(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const inscripcion = await InscripcionCurso.findOne({
      where: { id: req.params.inscripcionId, colaborador_id: colaborador.id },
      include: [Curso],
    });
    if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
    if (inscripcion.estado === 'completado') throw new HttpError(409, 'Este curso ya está completado.');
    const maxIntentos = maxIntentosDe(inscripcion.Curso);
    if (!inscripcion.quiz_aprobado && inscripcion.quiz_intentos >= maxIntentos) {
      throw new HttpError(409, `Ya usaste tus ${maxIntentos} intentos permitidos para esta evaluación. Contacta a RRHH si necesitas un intento adicional.`);
    }

    const totalVideos = await CursoVideo.count({ where: { curso_id: inscripcion.curso_id, activo: true } });
    const videosVistos = await InscripcionCursoVideo.count({ where: { inscripcion_id: inscripcion.id } });
    if (totalVideos > 0 && videosVistos < totalVideos) {
      throw new HttpError(409, 'Debes terminar de ver todos los videos del curso antes de presentar la evaluación final.');
    }

    const preguntas = await CursoPregunta.findAll({ where: { curso_id: inscripcion.curso_id, activo: true } });
    if (preguntas.length === 0) throw new HttpError(409, 'Este curso todavía no tiene evaluación final configurada.');

    const porId = new Map(preguntas.map((p) => [p.id, p]));
    const { respuestas } = req.body;
    if (respuestas.length !== preguntas.length) {
      throw new HttpError(400, `Responde las ${preguntas.length} preguntas de la evaluación.`);
    }

    let correctas = 0;
    const detalle = respuestas.map(({ preguntaId, opcionElegida }) => {
      const pregunta = porId.get(preguntaId);
      if (!pregunta) throw new HttpError(400, 'Una de las respuestas no corresponde a este curso.');
      const esCorrecta = Number(opcionElegida) === Number(pregunta.respuesta_correcta);
      if (esCorrecta) correctas += 1;
      return { preguntaId, esCorrecta, respuestaCorrecta: pregunta.respuesta_correcta };
    });

    const puntaje = Math.round((correctas / preguntas.length) * 100);
    const aprobado = puntaje >= PUNTAJE_MINIMO_QUIZ;

    await inscripcion.update({
      quiz_intentos: inscripcion.quiz_intentos + 1,
      quiz_mejor_puntaje: Math.max(inscripcion.quiz_mejor_puntaje, puntaje),
      quiz_aprobado: inscripcion.quiz_aprobado || aprobado,
    });
    const cambiosFinalizacion = await evaluarFinalizacionCurso(inscripcion);
    await inscripcion.update(cambiosFinalizacion);

    await registrarAuditoria({
      req,
      accion: 'presentar_evaluacion_curso',
      entidad: 'inscripciones_cursos',
      entidadId: inscripcion.id,
      detalles: { puntaje, aprobado },
    });

    res.json({
      data: {
        puntaje,
        aprobado,
        puntajeMinimo: PUNTAJE_MINIMO_QUIZ,
        intentosUsados: inscripcion.quiz_intentos,
        maxIntentos,
        detalle,
        inscripcion,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Genera y descarga el PDF real del certificado. Se regenera en cada
// solicitud a partir de los datos ya persistidos (nunca se guarda en disco),
// así el documento siempre refleja el estado actual de la inscripción y no
// hay archivos de certificados que proteger o filtrar por error. Solo el
// propio colaborador dueño de la inscripción puede descargarlo (RRHH/SUPER_ADMIN
// no necesitan ver certificados individuales de terceros en este flujo).
async function descargarCertificado(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const inscripcion = await InscripcionCurso.findOne({
      where: { id: req.params.inscripcionId, colaborador_id: colaborador.id },
      include: [Curso],
    });
    if (!inscripcion) throw new HttpError(404, 'Inscripción no encontrada.');
    if (inscripcion.estado !== 'completado' || !inscripcion.certificado_url) {
      throw new HttpError(409, 'Este curso todavía no tiene un certificado disponible.');
    }

    const usuario = await Usuario.findByPk(req.user.id, { attributes: ['nombre'] });
    const pdfBuffer = await generarCertificadoPdf({
      nombreColaborador: usuario.nombre,
      tituloCurso: inscripcion.Curso.titulo,
      duracionHoras: inscripcion.Curso.duracion_horas,
      fechaFin: inscripcion.fecha_fin,
      inscripcionId: inscripcion.id,
      colaboradorId: colaborador.id,
      cursoId: inscripcion.Curso.id,
    });

    await registrarAuditoria({ req, accion: 'descargar_certificado', entidad: 'inscripciones_cursos', entidadId: inscripcion.id });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-${inscripcion.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

async function expediente(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const [documentos, okrs, citas, planDesarrolloBase] = await Promise.all([
      ExpedienteDocumento.findAll({ where: { colaborador_id: colaborador.id, activo: true } }),
      ObjetivoOkr.findAll({ where: { colaborador_id: colaborador.id } }),
      Cita.findAll({
        where: { colaborador_id: colaborador.id, estado: 'completada' },
        include: [{ model: Especialista, include: [{ model: Usuario, attributes: ['nombre'] }] }],
        order: [['fecha_hora', 'DESC']],
        limit: 20,
      }),
      // Plan Individual de Desarrollo: acciones (típicamente un curso
      // recomendado) que RRHH asignó a raíz de un gap detectado en una
      // evaluación de desempeño. Antes el colaborador no tenía forma de
      // verlo — solo RRHH lo veía (y sin curso real asociado, ver
      // empresaController.actualizarPid).
      //
      // Antes esta consulta usaba `include: [Curso]` junto con
      // `order:[['id','DESC']]` — mismo patrón de relaciones no pobladas ya
      // visto en otros módulos (el curso recomendado podía salir en blanco
      // de forma intermitente). Se trae sin `include` y se combina abajo.
      PlanDesarrollo.findAll({ where: { colaborador_id: colaborador.id }, order: [['id', 'DESC']] }),
    ]);
    const cursoIds = [...new Set(planDesarrolloBase.map((p) => p.curso_id).filter(Boolean))];
    const cursos = cursoIds.length ? await Curso.findAll({ where: { id: cursoIds }, attributes: ['id', 'titulo'] }) : [];
    const cursoPorId = new Map(cursos.map((c) => [c.id, c]));
    const planDesarrollo = planDesarrolloBase.map((p) => {
      const plano = p.get({ plain: true });
      return { ...plano, Curso: plano.curso_id ? cursoPorId.get(plano.curso_id) || null : null };
    });
    res.json({ data: { documentos, okrs, historialAsesorias: citas, planDesarrollo } });
  } catch (err) {
    next(err);
  }
}

// Encuestas de clima activas de la propia empresa, con indicador de si el
// colaborador ya respondió (solo detectable en encuestas NO anónimas: en
// las anónimas jamás se guarda el colaborador_id, así que no hay forma de
// saberlo sin romper el anonimato — se muestran siempre como pendientes).
async function encuestasActivas(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    const hoy = new Date().toISOString().slice(0, 10);
    const encuestas = await EncuestaClima.findAll({
      where: { empresa_id: colaborador.empresa_id, estado: 'activa', fecha_inicio: { [Op.lte]: hoy }, fecha_fin: { [Op.gte]: hoy } },
      order: [['id', 'DESC']],
    });

    // Consulta directa de las preguntas (no `include` de Sequelize): se
    // confirmó que el `include` puede devolver el array vacío para
    // encuestas que sí tienen preguntas guardadas (ver el comentario en
    // `preguntasPorEncuesta` en empresaController.js para el detalle). Sin
    // esto, el colaborador veía "0 preguntas" y no podía diligenciar
    // encuestas que RRHH ya había configurado correctamente.
    const idsEncuestas = encuestas.map((e) => e.id);
    const todasLasPreguntas = idsEncuestas.length
      ? await EncuestaPregunta.findAll({ where: { encuesta_id: idsEncuestas }, order: [['orden', 'ASC']] })
      : [];
    const preguntasPorEncuestaId = new Map();
    for (const p of todasLasPreguntas) {
      const lista = preguntasPorEncuestaId.get(p.encuesta_id) || [];
      lista.push(p);
      preguntasPorEncuestaId.set(p.encuesta_id, lista);
    }

    const respondidasNoAnonimas = await EncuestaRespuesta.findAll({
      where: { colaborador_id: colaborador.id, encuesta_id: encuestas.filter((e) => !e.anonima).map((e) => e.id) },
      attributes: ['encuesta_id'],
      group: ['encuesta_id'],
    });
    const idsRespondidas = new Set(respondidasNoAnonimas.map((r) => r.encuesta_id));

    const data = encuestas.map((e) => ({
      ...e.get({ plain: true }),
      EncuestaPreguntas: preguntasPorEncuestaId.get(e.id) || [],
      yaRespondida: idsRespondidas.has(e.id),
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// Evaluaciones de desempeño asignadas al colaborador (cuestionario de
// sí/no, numéricas y texto libre — ver empresaController.crearEvaluacion).
// Igual que con encuestas de clima, las preguntas y las propias respuestas
// del colaborador se traen con queries separadas, nunca con `include`.
//
// La nota NUNCA viaja en la respuesta mientras `estado !== 'cerrada'`: ni
// siquiera como campo `null` que insinúe su existencia, para que no haya
// forma de inferir el resultado antes de que el evaluador termine de
// calificar el texto libre (si la evaluación lo requiere).
async function evaluacionesAsignadas(req, res, next) {
  try {
    const colaborador = await miColaborador(req.user.id);
    // Antes: `include: [TipoEvaluacion]` junto con `order:[['id','DESC']]`
    // en la consulta padre — mismo patrón de relaciones no pobladas ya
    // visto en otros módulos (el nombre del tipo de evaluación podía salir
    // en blanco de forma intermitente). Se trae sin `include` y se combina
    // con un Map.
    const evaluaciones = await Evaluacion.findAll({
      where: { colaborador_id: colaborador.id },
      order: [['id', 'DESC']],
    });
    const tipoIds = [...new Set(evaluaciones.map((e) => e.tipo_evaluacion_id).filter(Boolean))];
    const tipos = tipoIds.length ? await TipoEvaluacion.findAll({ where: { id: tipoIds } }) : [];
    const tipoPorId = new Map(tipos.map((t) => [t.id, t]));

    const idsConCuestionario = evaluaciones.filter((e) => e.puntos_totales !== null).map((e) => e.id);
    const [preguntas, respuestas] = await Promise.all([
      idsConCuestionario.length
        ? EvaluacionPregunta.findAll({ where: { evaluacion_id: idsConCuestionario }, order: [['orden', 'ASC']] })
        : [],
      idsConCuestionario.length
        ? EvaluacionRespuesta.findAll({ where: { evaluacion_id: idsConCuestionario } })
        : [],
    ]);
    const preguntasPorEvaluacion = new Map();
    for (const p of preguntas) {
      const lista = preguntasPorEvaluacion.get(p.evaluacion_id) || [];
      lista.push(p);
      preguntasPorEvaluacion.set(p.evaluacion_id, lista);
    }
    const respuestasPorEvaluacion = new Map();
    for (const r of respuestas) {
      const lista = respuestasPorEvaluacion.get(r.evaluacion_id) || [];
      lista.push(r);
      respuestasPorEvaluacion.set(r.evaluacion_id, lista);
    }

    const data = evaluaciones
      .filter((e) => e.puntos_totales !== null) // solo las que tienen cuestionario asignado; las de competencias 1-5 no las responde el colaborador
      .map((e) => {
        const yaRespondida = Boolean(e.respondida_en);
        const plano = e.get({ plain: true });
        return {
          id: e.id,
          periodo: plano.periodo,
          estado: plano.estado,
          TipoEvaluacion: tipoPorId.get(plano.tipo_evaluacion_id) || null,
          requiereCalificacionManual: plano.requiere_calificacion_manual,
          respondida: yaRespondida,
          puntosTotales: Number(plano.puntos_totales),
          // La calificación (nota_final) SOLO se incluye cuando la
          // evaluación está 'cerrada' — es decir, cuando ya es visible.
          notaFinal: plano.estado === 'cerrada' ? Number(plano.nota_final) : undefined,
          // Preguntas solo se envían si aún no respondió (para el
          // formulario); una vez respondida no hace falta reenviarlas.
          preguntas: yaRespondida ? undefined : (preguntasPorEvaluacion.get(e.id) || []),
        };
      });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

const responderEvaluacionSchema = z.object({
  body: z
    .object({
      respuestas: z
        .array(
          z.object({
            preguntaId: z.coerce.number().int().positive(),
            valorSiNo: z.coerce.boolean().optional(),
            valorNumerico: z.coerce.number().optional(),
            valorTexto: z.string().max(2000).optional(),
          })
        )
        .min(1),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

async function responderEvaluacion(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const colaborador = await miColaborador(req.user.id);
    const evaluacion = await Evaluacion.findOne({ where: { id: req.params.id, colaborador_id: colaborador.id }, transaction: t });
    if (!evaluacion) throw new HttpError(404, 'Evaluación no encontrada.');
    if (evaluacion.puntos_totales === null) throw new HttpError(400, 'Esta evaluación no tiene un cuestionario para responder.');
    if (evaluacion.respondida_en) throw new HttpError(409, 'Ya respondiste esta evaluación.');

    const preguntas = await EvaluacionPregunta.findAll({ where: { evaluacion_id: evaluacion.id }, transaction: t });
    const preguntasPorId = new Map(preguntas.map((p) => [p.id, p]));
    if (req.body.respuestas.length !== preguntas.length || !req.body.respuestas.every((r) => preguntasPorId.has(r.preguntaId))) {
      throw new HttpError(400, 'Debes responder todas las preguntas de la evaluación.');
    }

    const filas = req.body.respuestas.map((r) => {
      const pregunta = preguntasPorId.get(r.preguntaId);
      const base = { evaluacion_id: evaluacion.id, pregunta_id: pregunta.id };
      if (pregunta.tipo === 'si_no') {
        if (typeof r.valorSiNo !== 'boolean') throw new HttpError(400, `Falta responder "${pregunta.texto}".`);
        const esCorrecta = r.valorSiNo === pregunta.respuesta_correcta_si_no;
        return { ...base, valor_si_no: r.valorSiNo, es_correcta: esCorrecta, puntos_obtenidos: esCorrecta ? Number(pregunta.puntos) : 0, calificada: true };
      }
      if (pregunta.tipo === 'numerica') {
        if (typeof r.valorNumerico !== 'number' || Number.isNaN(r.valorNumerico)) throw new HttpError(400, `Falta responder "${pregunta.texto}".`);
        const esCorrecta = Number(r.valorNumerico) === Number(pregunta.respuesta_correcta_numerica);
        return { ...base, valor_numerico: r.valorNumerico, es_correcta: esCorrecta, puntos_obtenidos: esCorrecta ? Number(pregunta.puntos) : 0, calificada: true };
      }
      // texto_libre: siempre queda pendiente de calificación manual.
      if (!r.valorTexto || !r.valorTexto.trim()) throw new HttpError(400, `Falta responder "${pregunta.texto}".`);
      return { ...base, valor_texto: r.valorTexto.trim(), es_correcta: null, puntos_obtenidos: null, calificada: false };
    });

    await EvaluacionRespuesta.bulkCreate(filas, { transaction: t });

    const notaParcial = filas.reduce((sum, f) => sum + (f.puntos_obtenidos || 0), 0);
    const requiereManual = Boolean(evaluacion.requiere_calificacion_manual);

    await evaluacion.update(
      {
        respondida_en: new Date(),
        nota_parcial: notaParcial,
        // Sin preguntas de texto libre: se autocalifica todo de una vez y
        // la nota queda visible de inmediato. Con texto libre: la
        // evaluación pasa a 'en_progreso' y la nota se queda oculta hasta
        // que el evaluador la califique (ver calificarRespuestasEvaluacion).
        estado: requiereManual ? 'en_progreso' : 'cerrada',
        nota_final: requiereManual ? null : notaParcial,
        fecha_cierre: requiereManual ? null : new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    res.status(201).json({
      mensaje: requiereManual
        ? 'Respuesta registrada. Tu calificación estará disponible cuando el evaluador revise las preguntas de texto libre.'
        : 'Respuesta registrada y calificada automáticamente.',
      data: requiereManual ? { pendienteCalificacion: true } : { pendienteCalificacion: false, notaFinal: notaParcial, puntosTotales: Number(evaluacion.puntos_totales) },
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

module.exports = {
  home,
  categorias,
  especialistasDisponibles,
  horariosDisponibles,
  agendarCita,
  misCitas,
  cancelarCita,
  reagendarCita,
  academia,
  inscribirCurso,
  marcarVideoVisto,
  enviarEvaluacionCurso,
  descargarCertificado,
  expediente,
  encuestasActivas,
  evaluacionesAsignadas,
  responderEvaluacion,
  crearCitaSchema,
  reagendarCitaSchema,
  progresoSchema,
  videoVistoSchema,
  evaluacionCursoSchema,
  responderEvaluacionSchema,
};
