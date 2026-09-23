const { Router } = require('express');
const ctrl = require('../controllers/permisosController');
const { requireAuth } = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/rbac');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('permisos.leer'), ctrl.list);
router.get('/export', requirePermission('permisos.exportar'), ctrl.exportData);

module.exports = router;
