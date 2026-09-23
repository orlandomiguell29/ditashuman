const { Router } = require('express');
const ctrl = require('../controllers/adminDashboardController');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

// Panorama de toda la plataforma: solo tiene sentido para SUPER_ADMIN, no es
// un permiso granular de una empresa cliente (mismo patrón que integracionesRoutes.js).
function soloSuperAdmin(req, res, next) {
  if (req.user?.rol !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Solo un SUPER_ADMIN puede ver el panorama de la plataforma.' });
  }
  return next();
}

router.get('/', requireAuth, soloSuperAdmin, ctrl.dashboard);

module.exports = router;
