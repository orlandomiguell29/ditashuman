const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Limitador general de la API (mitiga fuerza bruta/DoS de bajo nivel).
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
});

// Limitador estricto para el endpoint de login: clave por IP + email para
// no bloquear a todos los usuarios detrás de un mismo NAT corporativo por
// el intento fallido de una sola cuenta.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' },
});

module.exports = { apiLimiter, loginLimiter };
