const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const hpp = require('hpp');
const morgan = require('morgan');
const { doubleCsrf } = require('csrf-csrf');

const env = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middlewares/rateLimit');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Detrás de un proxy/balanceador (Nginx, Render, etc.) para que req.ip y las
// cookies "secure" funcionen correctamente.
app.set('trust proxy', 1);

// --- Cabeceras de seguridad HTTP (OWASP Secure Headers) ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// --- CORS restringido a los orígenes conocidos del frontend (nunca "*") ---
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true, // necesario para la cookie httpOnly del refresh token
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(hpp()); // previene HTTP Parameter Pollution
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: { write: (m) => logger.info(m.trim()) } }));

app.use('/api', apiLimiter);

// --- Protección CSRF (double-submit cookie) para todo verbo mutante ---
// El access token va en el header Authorization (no en cookie), por lo que
// el CSRF clásico afecta principalmente a /api/auth/refresh y /logout, que
// sí dependen de la cookie httpOnly. Se protege igualmente toda mutación.
const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  cookieName: env.NODE_ENV === 'production' ? '__Host-ditash.csrf' : 'ditash.csrf',
  cookieOptions: { sameSite: 'strict', secure: env.COOKIE_SECURE, path: '/' },
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

app.get('/api/csrf-token', (req, res) => {
  // `overwrite: true` fuerza SIEMPRE un token nuevo en vez de intentar
  // validar y reutilizar una cookie `ditash.csrf` que ya traiga el
  // navegador. Sin esto, si esa cookie quedó firmada con un CSRF_SECRET
  // anterior (ej. al rotar secretos en desarrollo), generateToken() falla
  // aquí mismo con EBADCSRFTOKEN — incluso pidiendo un token nuevo — y el
  // usuario queda bloqueado hasta que borre la cookie a mano.
  const token = generateToken(req, res, { overwrite: true });
  res.json({ csrfToken: token });
});

app.use('/api', (req, res, next) => {
  // Rutas exentas de CSRF: login (aún no hay sesión) y health check.
  // IMPORTANTE: dentro de un middleware montado con `app.use('/api', ...)`,
  // Express recorta el prefijo "/api" de `req.path` mientras dura esta
  // petición (y lo restaura después) — por eso aquí se comparan las rutas
  // SIN el prefijo. Comparar contra '/api/auth/login' nunca coincide y deja
  // el login exigiendo un CSRF token que nunca debió pedir.
  const exentas = ['/auth/login', '/health'];
  if (exentas.includes(req.path) || req.method === 'GET') return next();
  return doubleCsrfProtection(req, res, next);
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
