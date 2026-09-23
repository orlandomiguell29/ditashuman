const { Router } = require('express');
const ctrl = require('../controllers/usuariosController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('usuarios.leer'), ctrl.list);
router.get('/export', requirePermission('usuarios.exportar'), ctrl.exportData);
router.get('/:id', requirePermission('usuarios.leer'), ctrl.getOne);
router.post('/', requirePermission('usuarios.crear'), validate(ctrl.crearUsuarioSchema), ctrl.create);
router.put('/:id', requirePermission('usuarios.actualizar'), validate(ctrl.actualizarUsuarioSchema), ctrl.update);
router.patch('/:id/inactivar', requirePermission('usuarios.inactivar'), ctrl.inactivar);
router.patch('/:id/activar', requirePermission('usuarios.actualizar'), ctrl.activar);
router.post('/:id/reset-password', requirePermission('usuarios.actualizar'), ctrl.resetPassword);

module.exports = router;
