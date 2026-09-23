const { Router } = require('express');
const {
  cursos,
  cursoSchema,
  cursoVideos,
  cursoVideoSchema,
  cursoPreguntas,
  cursoPreguntaSchema,
  competencias,
  competenciaSchema,
  tiposEvaluacionCtrl,
  tipoEvaluacionSchema,
  categorias,
  categoriaSchema,
  categoriaUpdateSchema,
} = require('../controllers/catalogosController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

// Router genérico para catálogos simples con activar/inactivar (nunca
// borrado físico — ver justificación en utils/crudFactory.js).
function crudRouter(ctrl, modulo, { crearSchema, actualizarSchema, permiteInactivar = true } = {}) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', requirePermission(`${modulo}.leer`), ctrl.list);
  router.get('/export', requirePermission(`${modulo}.exportar`), ctrl.exportData);
  router.get('/:id', requirePermission(`${modulo}.leer`), ctrl.getOne);
  router.post('/', requirePermission(`${modulo}.crear`), crearSchema ? validate(crearSchema) : (r, s, n) => n(), ctrl.create);
  router.put('/:id', requirePermission(`${modulo}.actualizar`), actualizarSchema ? validate(actualizarSchema) : (r, s, n) => n(), ctrl.update);
  if (permiteInactivar) {
    router.patch('/:id/inactivar', requirePermission(`${modulo}.inactivar`), ctrl.inactivar);
    router.patch('/:id/activar', requirePermission(`${modulo}.inactivar`), ctrl.activar);
  }
  return router;
}

// Videos de un curso (enlaces de YouTube): anidado bajo /catalogos/cursos,
// reutiliza los mismos permisos `cursos.*` que el resto del catálogo de
// cursos, ya que administrar sus videos es parte de administrar el curso.
const cursosRouterBase = crudRouter(cursos, 'cursos', { crearSchema: cursoSchema, actualizarSchema: cursoSchema });
cursosRouterBase.get('/:cursoId/videos', requirePermission('cursos.leer'), cursoVideos.list);
cursosRouterBase.post('/:cursoId/videos', requirePermission('cursos.crear'), validate(cursoVideoSchema), cursoVideos.create);
cursosRouterBase.put('/:cursoId/videos/:videoId', requirePermission('cursos.actualizar'), validate(cursoVideoSchema), cursoVideos.update);
cursosRouterBase.patch('/:cursoId/videos/:videoId/inactivar', requirePermission('cursos.inactivar'), cursoVideos.inactivar);

// Preguntas de la evaluación final del curso: mismo patrón anidado que los
// videos, mismos permisos `cursos.*`.
cursosRouterBase.get('/:cursoId/preguntas', requirePermission('cursos.leer'), cursoPreguntas.list);
cursosRouterBase.post('/:cursoId/preguntas', requirePermission('cursos.crear'), validate(cursoPreguntaSchema), cursoPreguntas.create);
cursosRouterBase.put('/:cursoId/preguntas/:preguntaId', requirePermission('cursos.actualizar'), validate(cursoPreguntaSchema), cursoPreguntas.update);
cursosRouterBase.patch('/:cursoId/preguntas/:preguntaId/inactivar', requirePermission('cursos.inactivar'), cursoPreguntas.inactivar);

module.exports = {
  categoriasRouter: crudRouter(categorias, 'categorias', { crearSchema: categoriaSchema, actualizarSchema: categoriaUpdateSchema }),
  cursosRouter: cursosRouterBase,
  competenciasRouter: crudRouter(competencias, 'evaluaciones', { crearSchema: competenciaSchema, actualizarSchema: competenciaSchema }),
  tiposEvaluacionRouter: crudRouter(tiposEvaluacionCtrl, 'evaluaciones', {
    crearSchema: tipoEvaluacionSchema,
    actualizarSchema: tipoEvaluacionSchema,
    permiteInactivar: false,
  }),
};
