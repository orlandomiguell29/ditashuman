const { Router } = require('express');
const ctrl = require('../controllers/integracionesController');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

// Conectar/desconectar Google afecta a TODA la plataforma (una sola cuenta
// compartida, ver googleMeet.js), así que se restringe a SUPER_ADMIN en vez
// de usar un permiso granular de empresa — no es una acción de RRHH de una
// empresa cliente ni de un especialista individual.
function soloSuperAdmin(req, res, next) {
  if (req.user?.rol !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Solo un SUPER_ADMIN puede administrar integraciones de la plataforma.' });
  }
  return next();
}

// El callback de Google llega como una navegación normal del navegador
// (redirección desde accounts.google.com), no como llamada autenticada de
// nuestro frontend: por eso NO lleva requireAuth. Su propia seguridad es
// el `state` de un solo uso generado en /conectar (ver integracionesController).
router.get('/google/callback', ctrl.callback);

// Cualquier usuario autenticado puede saber si Meet está disponible (lo
// necesita el colaborador al agendar), sin exponer la cuenta conectada.
router.get('/google/disponible', requireAuth, ctrl.estadoPublico);

router.use('/google', requireAuth, soloSuperAdmin);
router.get('/google/conectar', ctrl.conectar);
router.get('/google/estado', ctrl.estado);
router.post('/google/desconectar', ctrl.desconectar);

module.exports = router;
