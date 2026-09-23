const { Router } = require('express');
const ctrl = require('../controllers/rolesController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('roles.leer'), ctrl.list);
router.get('/export', requirePermission('roles.exportar'), ctrl.exportData);
router.get('/:id', requirePermission('roles.leer'), ctrl.getOne);
router.post('/', requirePermission('roles.crear'), validate(ctrl.crearRolSchema), ctrl.create);
router.put('/:id', requirePermission('roles.actualizar'), validate(ctrl.actualizarRolSchema), ctrl.update);
router.patch('/:id/inactivar', requirePermission('roles.inactivar'), ctrl.inactivar);
router.patch('/:id/activar', requirePermission('roles.actualizar'), ctrl.activar);

module.exports = router;
