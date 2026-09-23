const { Router } = require('express');
const ctrl = require('../controllers/auditoriaController');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

// El log de actividad del sistema es una vista de plataforma completa (de
// todas las empresas), no algo que un ADMIN_EMPRESA deba ver aunque el
// catálogo de permisos ya tenga un código 'auditoria.leer' pensado para
// ellos a futuro — mismo patrón que adminDashboardRoutes.js.
function soloSuperAdmin(req, res, next) {
  if (req.user?.rol !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Solo un SUPER_ADMIN puede ver el log de actividad del sistema.' });
  }
  return next();
}

router.use(requireAuth, soloSuperAdmin);

router.get('/', ctrl.list);
router.get('/export', ctrl.exportarAuditoria);

module.exports = router;
