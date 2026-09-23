const { Router } = require('express');
const ctrl = require('../controllers/empresasController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('empresas.leer'), ctrl.list);
router.get('/export', requirePermission('empresas.exportar'), ctrl.exportData);
router.get('/:id', requirePermission('empresas.leer'), ctrl.getOne);
router.post('/', requirePermission('empresas.crear'), validate(ctrl.empresaSchema), ctrl.create);
router.put('/:id', requirePermission('empresas.actualizar'), validate(ctrl.empresaUpdateSchema), ctrl.update);
// Nunca se borra una empresa físicamente: arrastraría colaboradores, citas,
// evaluaciones y comisiones con ella. Se inactiva (bloquea el acceso de
// todos sus usuarios sin perder el historial).
router.patch('/:id/inactivar', requirePermission('empresas.inactivar'), ctrl.inactivar);
router.patch('/:id/activar', requirePermission('empresas.inactivar'), ctrl.activar);

module.exports = router;
