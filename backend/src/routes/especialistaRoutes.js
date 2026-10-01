const { Router } = require('express');
const ctrl = require('../controllers/especialistaController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');
const { upload } = require('../middlewares/upload');

const router = Router();
router.use(requireAuth, requirePermission('especialistas.leer'));

router.get('/dashboard', ctrl.dashboard);
router.get('/agenda', ctrl.agenda);
router.post('/horarios', validate(ctrl.horarioSchema), ctrl.crearHorario);
router.put('/horarios/:id', validate(ctrl.horarioSchema), ctrl.actualizarHorario);
router.delete('/horarios/:id', ctrl.eliminarHorario);
router.patch('/duracion', validate(ctrl.actualizarDuracionSchema), ctrl.actualizarDuracion);
router.patch('/citas/:id/confirmar', ctrl.confirmarCita);
router.patch('/citas/:id/cancelar', ctrl.cancelarCita);
router.patch('/citas/:id/reagendar', validate(ctrl.reagendarCitaSchema), ctrl.reagendarCita);
router.post('/citas/:id/completar', ctrl.marcarCompletada);
router.get('/citas/export', requirePermission('citas.exportar'), ctrl.exportarCitas);

// Historia clínica: se puede diligenciar/consultar en cualquier estado de
// la cita (pendiente/confirmada incluye "durante la videollamada en vivo";
// completada/no_asistio cubre diligenciarla después) — la restricción real
// no es el estado de la cita, es que la nota quede 'finalizada' (ver
// especialistaController.guardarHistoriaClinica), no el estado de la cita.
router.get('/citas/:id/historia-clinica', requirePermission('historias_clinicas.leer'), ctrl.historiaClinica);
router.put(
  '/citas/:id/historia-clinica',
  requirePermission('historias_clinicas.actualizar'),
  validate(ctrl.historiaClinicaSchema),
  ctrl.guardarHistoriaClinica
);
router.get('/citas/:id/historia-clinica/pdf', requirePermission('historias_clinicas.leer'), ctrl.descargarHistoriaClinicaPdf);
router.post(
  '/citas/:id/historia-clinica/adjuntos',
  requirePermission('historias_clinicas.actualizar'),
  upload.single('archivo'),
  ctrl.subirAdjuntoHistoria
);
router.get(
  '/citas/:id/historia-clinica/adjuntos/:adjuntoId',
  requirePermission('historias_clinicas.leer'),
  ctrl.descargarAdjuntoHistoria
);
router.delete(
  '/citas/:id/historia-clinica/adjuntos/:adjuntoId',
  requirePermission('historias_clinicas.actualizar'),
  ctrl.eliminarAdjuntoHistoria
);
// PDF consolidado de TODAS las sesiones finalizadas de un paciente con
// este especialista — vive bajo /pacientes (no /citas) porque no está
// atado a una sola cita, sino a la relación especialista-paciente.
router.get(
  '/pacientes/:colaboradorId/historial-pdf',
  requirePermission('historias_clinicas.leer'),
  ctrl.descargarHistorialConsolidadoPdf
);
router.get('/ingresos', ctrl.ingresos);
router.get('/ingresos/export', requirePermission('comisiones.exportar'), ctrl.exportarIngresos);

module.exports = router;
