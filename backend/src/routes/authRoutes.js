const { Router } = require('express');
const ctrl = require('../controllers/authController');
const { validate } = require('../middlewares/validate');
const { requireAuth } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimit');

const router = Router();

router.post('/login', loginLimiter, validate(ctrl.loginSchema), ctrl.login);
router.post('/login/mfa', loginLimiter, validate(ctrl.loginMfaSchema), ctrl.loginMfa);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/cambiar-password', requireAuth, validate(ctrl.cambiarPasswordSchema), ctrl.cambiarPassword);
// Mismo limitador que login: evita usarlo para bombardear de correos a un
// email ajeno o para medir por timing si una cuenta existe.
router.post('/forgot-password', loginLimiter, validate(ctrl.forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password', loginLimiter, validate(ctrl.resetPasswordSchema), ctrl.resetPassword);

module.exports = router;
