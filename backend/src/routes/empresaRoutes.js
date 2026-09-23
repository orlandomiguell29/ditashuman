const { Router } = require('express');
const ctrl = require('../controllers/empresaController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

const router = Router();
router.use(requireAuth);

router.get('/dashboard', requirePermission('colaboradores.leer'), ctrl.dashboard);

router.get('/colaboradores', requirePermission('colaboradores.leer'), ctrl.listarColaboradores);
router.get('/colaboradores/export', requirePermission('colaboradores.exportar'), ctrl.exportarColaboradores);
router.get('/colaboradores/:id/cursos', requirePermission('cursos.leer'), ctrl.cursosDeColaborador);
router.patch(
  '/colaboradores/:id/cursos/:inscripcionId/reiniciar-evaluacion',
  requirePermission('cursos.actualizar'),
  ctrl.reiniciarEvaluacionCurso
);

router.get('/evaluaciones', requirePermission('evaluaciones.leer'), ctrl.listarEvaluaciones);
router.post('/evaluaciones', requirePermission('evaluaciones.crear'), validate(ctrl.crearEvaluacionSchema), ctrl.crearEvaluacion);
router.patch('/evaluaciones/pid/:id', requirePermission('evaluaciones.actualizar'), validate(ctrl.actualizarPidSchema), ctrl.actualizarPid);
// Calificar manualmente las respuestas de texto libre pendientes de un
// cuestionario ya respondido por el colaborador (ver crearEvaluacion: las
// de sí/no y numérica se autocalifican solas al responder).
router.patch(
  '/evaluaciones/:id/calificar',
  requirePermission('evaluaciones.actualizar'),
  validate(ctrl.calificarEvaluacionSchema),
  ctrl.calificarRespuestasEvaluacion
);

// Objetivos del Periodo (OKRs): RRHH los crea y actualiza el avance; el
// colaborador solo los consulta desde su propio portal (colaboradorRoutes,
// ya cubierto por el permiso general 'colaboradores.leer' de ese router).
router.get('/okrs', requirePermission('okrs.leer'), ctrl.listarOkrs);
router.get('/okrs/export', requirePermission('okrs.exportar'), ctrl.exportarOkrs);
router.post('/okrs', requirePermission('okrs.crear'), validate(ctrl.crearOkrSchema), ctrl.crearOkr);
router.patch('/okrs/:id', requirePermission('okrs.actualizar'), validate(ctrl.actualizarOkrSchema), ctrl.actualizarOkr);

router.get('/clima/encuestas', requirePermission('clima.leer'), ctrl.listarEncuestas);
router.post('/clima/encuestas', requirePermission('clima.crear'), validate(ctrl.crearEncuestaSchema), ctrl.crearEncuesta);
router.get('/clima/encuestas/:id/resultados', requirePermission('clima.leer'), ctrl.resultadosEncuesta);
router.patch('/clima/encuestas/:id/cerrar', requirePermission('clima.actualizar'), ctrl.cerrarEncuesta);
// Preguntas de una encuesta ya creada: permite corregir/completar una
// encuesta que quedó con 0 preguntas sin tener que borrarla y rehacerla.
router.get('/clima/encuestas/:id/preguntas', requirePermission('clima.leer'), ctrl.listarPreguntasEncuesta);
router.post('/clima/encuestas/:id/preguntas', requirePermission('clima.crear'), validate(ctrl.encuestaPreguntaSchema), ctrl.agregarPreguntaEncuesta);
router.put('/clima/encuestas/:id/preguntas/:preguntaId', requirePermission('clima.actualizar'), validate(ctrl.encuestaPreguntaSchema), ctrl.actualizarPreguntaEncuesta);
router.delete('/clima/encuestas/:id/preguntas/:preguntaId', requirePermission('clima.actualizar'), ctrl.eliminarPreguntaEncuesta);
// Responder queda accesible a cualquier usuario autenticado (típicamente un
// COLABORADOR, que no tiene permisos "clima.*"): la propia función valida
// que pertenezca a la empresa dueña de la encuesta (ver empresaController).
router.post('/clima/encuestas/:id/responder', validate(ctrl.responderEncuestaSchema), ctrl.responderEncuesta);

module.exports = router;
