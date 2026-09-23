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
router.get('/ingresos', ctrl.ingresos);
router.get('/ingresos/export', requirePermission('comisiones.exportar'), ctrl.exportarIngresos);

module.exports = router;
