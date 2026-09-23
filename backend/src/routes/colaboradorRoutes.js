const { Router } = require('express');
const ctrl = require('../controllers/colaboradorController');
const expedienteCtrl = require('../controllers/expedienteController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission, scopedToOwnCompany } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');
const { upload } = require('../middlewares/upload');
const { Colaborador } = require('../models');

const router = Router();
router.use(requireAuth, requirePermission('colaboradores.leer'));

// Defensa en profundidad adicional para la subida de documentos del
// expediente (ver auditoría de seguridad): expedienteController.subirDocumento
// YA valida esto, pero este endpoint tuvo un IDOR real cross-tenant (un
// ADMIN_EMPRESA podía subir un documento al expediente de un colaborador de
// OTRA empresa con solo mandar su id), así que se agrega una segunda capa
// independiente a nivel de ruta con `scopedToOwnCompany` — si algún día el
// controlador cambia y ese chequeo se rompe sin querer, esta capa lo sigue
// bloqueando. Si no viene `colaboradorId` en el body, el destino es el
// propio usuario autenticado (comportamiento normal para el rol
// COLABORADOR): nada que verificar cross-tenant en ese caso. (El archivo
// temporal que `upload.single` deja en disco si esta capa rechaza la
// subida es una fila huérfana de bajo riesgo, no un problema de seguridad
// — el propio controlador limpia el caso común.)
async function empresaDelColaboradorObjetivo(req) {
  if (!req.body.colaboradorId) return req.user.empresaId;
  const colaborador = await Colaborador.findByPk(req.body.colaboradorId);
  return colaborador ? colaborador.empresa_id : null;
}

router.get('/home', ctrl.home);
router.get('/categorias', ctrl.categorias);
router.get('/especialistas', ctrl.especialistasDisponibles);
router.get('/especialistas/:id/horarios', ctrl.horariosDisponibles);
router.get('/citas', ctrl.misCitas);
router.post('/citas', validate(ctrl.crearCitaSchema), ctrl.agendarCita);
router.patch('/citas/:id/cancelar', ctrl.cancelarCita);
router.patch('/citas/:id/reagendar', validate(ctrl.reagendarCitaSchema), ctrl.reagendarCita);
router.get('/academia', ctrl.academia);
router.post('/academia/:cursoId/inscribir', ctrl.inscribirCurso);
router.patch(
  '/academia/inscripciones/:inscripcionId/videos/:videoId/visto',
  validate(ctrl.videoVistoSchema),
  ctrl.marcarVideoVisto
);
router.post(
  '/academia/inscripciones/:inscripcionId/evaluacion',
  validate(ctrl.evaluacionCursoSchema),
  ctrl.enviarEvaluacionCurso
);
router.get('/academia/inscripciones/:inscripcionId/certificado', ctrl.descargarCertificado);
router.get('/expediente', ctrl.expediente);
router.post(
  '/expediente/documentos',
  upload.single('archivo'),
  scopedToOwnCompany(empresaDelColaboradorObjetivo),
  expedienteCtrl.subirDocumento
);
router.get('/expediente/documentos/:id/descargar', expedienteCtrl.descargarDocumento);
router.patch('/expediente/documentos/:id/inactivar', expedienteCtrl.inactivarDocumento);
// Encuestas de clima: el colaborador solo ve las activas de su empresa y
// responde (nunca administra encuestas, eso es exclusivo de RRHH en /empresa).
router.get('/clima/encuestas', ctrl.encuestasActivas);
// Evaluaciones de desempeño tipo cuestionario asignadas al colaborador: solo
// ve/responde las propias (ver colaboradorController.miColaborador), nunca
// administra evaluaciones (eso es exclusivo de RRHH en /empresa).
router.get('/evaluaciones', ctrl.evaluacionesAsignadas);
router.post('/evaluaciones/:id/responder', validate(ctrl.responderEvaluacionSchema), ctrl.responderEvaluacion);

module.exports = router;
