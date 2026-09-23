const { Router } = require('express');
const ctrl = require('../controllers/comisionesController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');
const { validate } = require('../middlewares/validate');

// Administración global de comisiones del marketplace (pagar/retener). El
// controlador exige SUPER_ADMIN explícitamente además del permiso — ver
// justificación en comisionesController.js.
const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('comisiones.leer'), ctrl.list);
router.get('/export', requirePermission('comisiones.exportar'), ctrl.exportData);
router.patch('/:id/pagar', requirePermission('comisiones.actualizar'), validate(ctrl.pagarSchema), ctrl.marcarPagada);
router.patch('/:id/retener', requirePermission('comisiones.actualizar'), ctrl.marcarRetenida);
router.patch('/:id/liberar', requirePermission('comisiones.actualizar'), ctrl.liberarRetencion);

module.exports = router;
