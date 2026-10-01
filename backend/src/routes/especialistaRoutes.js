const { Router } = require('express');
const ctrl = require('../controllers/especialistaController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

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
router.get('/ingresos', ctrl.ingresos);
router.get('/ingresos/export', requirePermission('comisiones.exportar'), ctrl.exportarIngresos);

module.exports = router;
