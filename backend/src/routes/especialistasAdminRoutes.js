const { Router } = require('express');
const ctrl = require('../controllers/especialistasAdminController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

// Rutas de administración del marketplace de especialistas (RRHH/SUPER_ADMIN).
// No exponen "crear": el alta de un especialista se hace únicamente desde
// /usuarios (usuariosController.create), que garantiza que todo especialista
// tenga un Usuario con credenciales de acceso desde el primer momento.
const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('especialistas.leer'), ctrl.list);
router.get('/export', requirePermission('especialistas.exportar'), ctrl.exportData);
router.get('/:id', requirePermission('especialistas.leer'), ctrl.getOne);
router.put('/:id', requirePermission('especialistas.actualizar'), validate(ctrl.actualizarSchema), ctrl.update);
router.patch('/:id/verificar', requirePermission('especialistas.actualizar'), ctrl.verificar);
router.patch('/:id/revocar-verificacion', requirePermission('especialistas.actualizar'), ctrl.revocarVerificacion);
router.patch('/:id/inactivar', requirePermission('especialistas.inactivar'), ctrl.inactivar);
router.patch('/:id/activar', requirePermission('especialistas.actualizar'), ctrl.activar);

module.exports = router;
