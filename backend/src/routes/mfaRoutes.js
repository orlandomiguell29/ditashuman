const { Router } = require('express');
const ctrl = require('../controllers/mfaController');
const { requireAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');

// Autogestión del propio MFA (cualquier usuario autenticado administra el
// suyo — nadie administra el MFA de otro usuario, ni siquiera SUPER_ADMIN,
// porque eso requeriría conocer un secreto TOTP ajeno).
const router = Router();
router.use(requireAuth);

router.get('/estado', ctrl.estado);
router.post('/iniciar', ctrl.iniciarEnrolamiento);
router.post('/activar', validate(ctrl.activarSchema), ctrl.activar);
router.post('/desactivar', validate(ctrl.desactivarSchema), ctrl.desactivar);

module.exports = router;
