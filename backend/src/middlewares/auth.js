const { verifyAccessToken } = require('../utils/jwt');

// Autenticación por Bearer token (access token de corta duración).
// No se acepta el token desde query string ni desde cookies para el access
// token (solo Authorization header), reduciendo superficie de CSRF/leak por logs.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autenticado. Falta el token de acceso.' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      rol: payload.rol,
      empresaId: payload.empresaId,
      permisos: payload.permisos || [],
    };
    return next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
    return res.status(401).json({ error: msg });
  }
}

module.exports = { requireAuth };
