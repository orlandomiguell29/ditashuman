const { z } = require('zod');
const authService = require('../services/authService');
const { registrarAuditoria } = require('../middlewares/audit');
const { PASSWORD_POLICY_REGEX } = require('../utils/password');
const env = require('../config/env');

const REFRESH_COOKIE = 'ditash_refresh';

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  // 'strict' por defecto (ver COOKIE_SAMESITE en config/env.js); configurable
  // por env var sin tocar código si el despliegue real necesita 'lax'.
  sameSite: env.COOKIE_SAMESITE,
  domain: env.NODE_ENV === 'production' ? env.COOKIE_DOMAIN : undefined,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(190),
    password: z.string().min(1).max(128),
  }),
  query: z.any(),
  params: z.any(),
});

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const resultado = await authService.login({
      email,
      password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Cuenta con MFA habilitado: aún no hay sesión, solo un reto de 5 min.
    // No se pone cookie de refresh todavía (no existe sesión real que
    // rotar), y se audita como paso intermedio, no como login exitoso.
    if (resultado.mfaRequerido) {
      await registrarAuditoria({ req, accion: 'login_mfa_requerido', detalles: { email } });
      return res.json({ mfaRequerido: true, mfaChallengeToken: resultado.mfaChallengeToken });
    }

    res.cookie(REFRESH_COOKIE, resultado.refreshToken, cookieOptions);
    await registrarAuditoria({ req: { ...req, user: { id: resultado.usuario.id } }, accion: 'login_exitoso' });

    return res.json({ accessToken: resultado.accessToken, usuario: resultado.usuario });
  } catch (err) {
    if (err.status === 401) {
      await registrarAuditoria({ req, accion: 'login_fallido', detalles: { email: req.body?.email } });
    }
    return next(err);
  }
}

const loginMfaSchema = z.object({
  body: z.object({
    mfaChallengeToken: z.string().min(10),
    codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.'),
  }).strict(),
  query: z.any(),
  params: z.any(),
});

async function loginMfa(req, res, next) {
  try {
    const resultado = await authService.completarLoginMfa({
      mfaChallengeToken: req.body.mfaChallengeToken,
      codigo: req.body.codigo,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie(REFRESH_COOKIE, resultado.refreshToken, cookieOptions);
    await registrarAuditoria({ req: { ...req, user: { id: resultado.usuario.id } }, accion: 'login_mfa_exitoso' });
    return res.json({ accessToken: resultado.accessToken, usuario: resultado.usuario });
  } catch (err) {
    if (err.status === 401) {
      await registrarAuditoria({ req, accion: 'login_mfa_fallido' });
    }
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: 'No hay sesión activa.' });

    const resultado = await authService.refreshSession({
      refreshToken: token,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie(REFRESH_COOKIE, resultado.refreshToken, cookieOptions);
    return res.json({ accessToken: resultado.accessToken, usuario: resultado.usuario });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    await authService.logout({ refreshToken: token });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    await registrarAuditoria({ req, accion: 'logout' });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function me(req, res) {
  return res.json({ usuario: req.user });
}

const cambiarPasswordSchema = z.object({
  body: z
    .object({
      actual: z.string().min(1),
      nueva: z.string().regex(PASSWORD_POLICY_REGEX, 'La contraseña debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo.'),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

async function cambiarPassword(req, res, next) {
  try {
    await authService.cambiarPassword({ usuarioId: req.user.id, actual: req.body.actual, nueva: req.body.nueva });
    await registrarAuditoria({ req, accion: 'cambio_password' });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email().max(190) }).strict(),
  query: z.any(),
  params: z.any(),
});

// Siempre responde 202 con el mismo mensaje exista o no la cuenta: el
// servicio decide internamente si envía el correo, sin filtrar esa
// información a quien llama el endpoint (mitiga enumeración de usuarios).
async function forgotPassword(req, res, next) {
  try {
    await authService.solicitarRecuperacion(req.body.email);
    await registrarAuditoria({ req, accion: 'solicitar_recuperacion_password', detalles: { email: req.body.email } });
    return res.status(202).json({ mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.' });
  } catch (err) {
    return next(err);
  }
}

const resetPasswordSchema = z.object({
  body: z
    .object({
      email: z.string().email().max(190),
      token: z.string().min(20).max(200),
      nueva: z.string().regex(PASSWORD_POLICY_REGEX, 'La contraseña debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo.'),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

async function resetPassword(req, res, next) {
  try {
    await authService.restablecerPassword({ email: req.body.email, token: req.body.token, nueva: req.body.nueva });
    await registrarAuditoria({ req, accion: 'restablecer_password', detalles: { email: req.body.email } });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  login,
  loginMfa,
  refresh,
  logout,
  me,
  cambiarPassword,
  forgotPassword,
  resetPassword,
  loginSchema,
  loginMfaSchema,
  cambiarPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
