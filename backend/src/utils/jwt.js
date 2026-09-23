const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Access token: corta duración, viaja en memoria/Authorization header, contiene
// claims mínimos (id, rol, permisos) para autorizar sin golpear la BD en cada request.
function signAccessToken(usuario, permisos) {
  return jwt.sign(
    {
      sub: usuario.id,
      rol: usuario.rol_codigo,
      empresaId: usuario.empresa_id,
      permisos, // array de códigos de permiso, ya resuelto
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL, issuer: 'ditash-api' }
  );
}

// Refresh token: vive solo en cookie httpOnly + secure, nunca accesible por JS
// en el navegador (mitiga robo por XSS). Claims mínimos, se valida contra su hash en BD.
function signRefreshToken(usuarioId, jti) {
  return jwt.sign({ sub: usuarioId, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
    issuer: 'ditash-api',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'ditash-api' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'ditash-api' });
}

// Token de "reto MFA": de un solo propósito y muy corta duración (5 min).
// Se emite tras validar email+contraseña cuando el usuario tiene MFA
// habilitado, y solo sirve para completar el segundo factor — no es un
// token de sesión (no lleva permisos ni sirve para llamar la API). Firmado
// con el mismo secreto de acceso pero con `typ: 'mfa_challenge'` para que
// nunca pueda confundirse con (ni reutilizarse como) un access token real.
function signMfaChallengeToken(usuarioId) {
  return jwt.sign({ sub: usuarioId, typ: 'mfa_challenge' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m', issuer: 'ditash-api' });
}

function verifyMfaChallengeToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'ditash-api' });
  if (payload.typ !== 'mfa_challenge') throw new Error('Token no es un reto MFA válido.');
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
};
