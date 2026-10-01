const { Router } = require('express');
const ctrl = require('../controllers/adminHistoriasClinicasController');
const { requireAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');

const router = Router();

// Corrección administrativa de historias clínicas: exclusiva de
// SUPER_ADMIN, mismo patrón que auditoriaRoutes.js — ADMIN_EMPRESA (RRHH de
// una empresa cliente) nunca debe poder listar ni anular notas clínicas de
// sus propios colaboradores, aunque administre otros módulos de su empresa.
function soloSuperAdmin(req, res, next) {
  if (req.user?.rol !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Solo un SUPER_ADMIN puede administrar historias clínicas.' });
  }
  return next();
}

router.use(requireAuth, soloSuperAdmin);

router.get('/', ctrl.listar);
router.patch('/:id/anular', validate(ctrl.anularSchema), ctrl.anular);

module.exports = router;
