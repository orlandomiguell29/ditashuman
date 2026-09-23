const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { Usuario, Rol, Permiso, RefreshToken } = require('../models');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaChallengeToken, verifyMfaChallengeToken } = require('../utils/jwt');
const { sha256Hex } = require('../utils/crypto');
const { HttpError } = require('../middlewares/errorHandler');
const { correoRecuperacionPassword } = require('../utils/mailer');
const { descifrarSecreto, verificarCodigo } = require('../utils/mfa');
const env = require('../config/env');

const RESET_TOKEN_TTL_MIN = 30;

const MAX_INTENTOS_FALLIDOS = 5;
const BLOQUEO_MINUTOS = 15;

async function resolvePermisos(rolId) {
  const rol = await Rol.findByPk(rolId, {
    include: [{ model: Permiso, attributes: ['codigo'], through: { attributes: [] } }],
  });
  if (!rol) return [];
  return rol.Permisos.map((p) => p.codigo);
}

async function login({ email, password, ip, userAgent }) {
  const usuario = await Usuario.scope('conAuth').findOne({
    where: { email: email.toLowerCase() },
    include: [{ model: Rol }],
  });

  // Respuesta genérica siempre (no revelar si el email existe: mitiga
  // enumeración de usuarios).
  const credencialesInvalidas = () => new HttpError(401, 'Credenciales inválidas.');

  if (!usuario) throw credencialesInvalidas();

  if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
    throw new HttpError(423, 'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta más tarde.');
  }

  if (usuario.estado !== 'activo' && usuario.estado !== 'pendiente_verificacion') {
    throw new HttpError(403, 'Cuenta inactiva o suspendida. Contacta a un administrador.');
  }

  const passwordValida = await verifyPassword(usuario.password_hash, password);

  if (!passwordValida) {
    usuario.intentos_fallidos += 1;
    if (usuario.intentos_fallidos >= MAX_INTENTOS_FALLIDOS) {
      usuario.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
      usuario.intentos_fallidos = 0;
    }
    await usuario.save();
    throw credencialesInvalidas();
  }

  usuario.intentos_fallidos = 0;
  usuario.ultimo_login_at = new Date();
  usuario.ultimo_login_ip = ip;
  await usuario.save();

  // Si el usuario tiene MFA habilitado, email+contraseña correctos NO son
  // suficientes: se emite un token de reto de un solo propósito (5 min) en
  // vez de la sesión completa. La sesión real solo se emite después de
  // validar el código TOTP en `completarLoginMfa`.
  if (usuario.mfa_habilitado) {
    return { mfaRequerido: true, mfaChallengeToken: signMfaChallengeToken(usuario.id) };
  }

  return emitirSesion(usuario, { ip, userAgent });
}

// Segundo factor: valida el reto emitido por `login()` más el código TOTP
// de 6 dígitos de la app autenticadora del usuario, y solo entonces emite
// la sesión real (access + refresh token).
async function completarLoginMfa({ mfaChallengeToken, codigo, ip, userAgent }) {
  let payload;
  try {
    payload = verifyMfaChallengeToken(mfaChallengeToken);
  } catch {
    throw new HttpError(401, 'El reto de verificación expiró o es inválido. Inicia sesión nuevamente.');
  }

  const usuario = await Usuario.scope('conAuth').findByPk(payload.sub, { include: [{ model: Rol }] });
  if (!usuario || !usuario.mfa_habilitado || !usuario.mfa_secret_cifrado) {
    throw new HttpError(401, 'No es posible completar el inicio de sesión.');
  }

  const secreto = descifrarSecreto(usuario.mfa_secret_cifrado);
  if (!verificarCodigo({ codigo, secreto })) {
    throw new HttpError(401, 'Código de verificación incorrecto.');
  }

  return emitirSesion(usuario, { ip, userAgent });
}

// Emite la sesión real (access + refresh token) para un usuario ya
// autenticado por completo (contraseña, y MFA si aplica). Compartido entre
// el login sin MFA y el segundo paso del login con MFA para no duplicar la
// lógica de emisión/rotación de tokens.
async function emitirSesion(usuario, { ip, userAgent }) {
  const permisos = await resolvePermisos(usuario.rol_id);

  const accessToken = signAccessToken(
    { id: usuario.id, rol_codigo: usuario.Rol.codigo, empresa_id: usuario.empresa_id },
    permisos
  );

  const jti = uuidv4();
  const familiaId = uuidv4();
  const refreshToken = signRefreshToken(usuario.id, jti);

  await RefreshToken.create({
    usuario_id: usuario.id,
    token_hash: sha256Hex(refreshToken),
    familia_id: familiaId,
    user_agent: userAgent?.slice(0, 255),
    ip,
    expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.Rol.codigo,
      empresaId: usuario.empresa_id,
      debeCambiarPass: usuario.debe_cambiar_pass,
      mfaHabilitado: usuario.mfa_habilitado,
      permisos,
    },
  };
}

// Rotación de refresh tokens: cada refresh invalida el token usado y emite
// uno nuevo. Si se detecta el reuso de un token ya revocado (posible robo),
// se revoca TODA la familia de tokens como medida de contención.
async function refreshSession({ refreshToken, ip, userAgent }) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'Sesión inválida. Inicia sesión nuevamente.');
  }

  const tokenHash = sha256Hex(refreshToken);
  const registro = await RefreshToken.findOne({ where: { token_hash: tokenHash } });

  if (!registro || registro.expira_en < new Date()) {
    throw new HttpError(401, 'Sesión expirada. Inicia sesión nuevamente.');
  }

  if (registro.revocado) {
    // Reuso detectado: el token ya había sido rotado. Revocamos toda la familia.
    await RefreshToken.update(
      { revocado: true },
      { where: { familia_id: registro.familia_id } }
    );
    throw new HttpError(401, 'Se detectó actividad sospechosa. Todas las sesiones fueron cerradas.');
  }

  registro.revocado = true;
  await registro.save();

  const usuario = await Usuario.findByPk(payload.sub, { include: [{ model: Rol }] });
  if (!usuario || usuario.estado !== 'activo') {
    throw new HttpError(401, 'Usuario no disponible.');
  }

  const permisos = await resolvePermisos(usuario.rol_id);
  const accessToken = signAccessToken(
    { id: usuario.id, rol_codigo: usuario.Rol.codigo, empresa_id: usuario.empresa_id },
    permisos
  );

  const nuevoJti = uuidv4();
  const nuevoRefreshToken = signRefreshToken(usuario.id, nuevoJti);
  await RefreshToken.create({
    usuario_id: usuario.id,
    token_hash: sha256Hex(nuevoRefreshToken),
    familia_id: registro.familia_id,
    user_agent: userAgent?.slice(0, 255),
    ip,
    expira_en: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken,
    refreshToken: nuevoRefreshToken,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.Rol.codigo,
      empresaId: usuario.empresa_id,
      mfaHabilitado: usuario.mfa_habilitado,
      permisos,
    },
  };
}

async function logout({ refreshToken }) {
  if (!refreshToken) return;
  const tokenHash = sha256Hex(refreshToken);
  await RefreshToken.update({ revocado: true }, { where: { token_hash: tokenHash } });
}

async function logoutAll(usuarioId) {
  await RefreshToken.update({ revocado: true }, { where: { usuario_id: usuarioId, revocado: false } });
}

async function cambiarPassword({ usuarioId, actual, nueva }) {
  const usuario = await Usuario.scope('conAuth').findByPk(usuarioId);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

  const ok = await verifyPassword(usuario.password_hash, actual);
  if (!ok) throw new HttpError(400, 'La contraseña actual no es correcta.');

  usuario.password_hash = await hashPassword(nueva);
  usuario.password_updated_at = new Date();
  usuario.debe_cambiar_pass = false;
  await usuario.save();
  await logoutAll(usuarioId); // fuerza a re-loguearse en todos los dispositivos
}

// Inicia la recuperación de contraseña: genera un token de un solo uso,
// guarda SOLO su hash (igual que un refresh token — si la base de datos se
// filtra, el token en claro no es recuperable) y envía el enlace por
// correo. SIEMPRE responde igual exista o no el email (mitiga enumeración
// de usuarios): el llamador nunca sabe si el correo estaba registrado.
async function solicitarRecuperacion(email) {
  const usuario = await Usuario.findOne({ where: { email: email.toLowerCase() } });
  if (!usuario) return; // silencioso a propósito

  const token = crypto.randomBytes(32).toString('base64url');
  usuario.reset_password_token_hash = sha256Hex(token);
  usuario.reset_password_expira = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
  await usuario.save();

  const enlace = `${env.FRONTEND_URL.replace(/\/$/, '')}/restablecer-password?token=${token}&email=${encodeURIComponent(usuario.email)}`;
  await correoRecuperacionPassword({ to: usuario.email, nombre: usuario.nombre, enlace });
}

async function restablecerPassword({ email, token, nueva }) {
  const usuario = await Usuario.scope('conAuth').findOne({ where: { email: email.toLowerCase() } });
  const invalido = () => new HttpError(400, 'El enlace de recuperación es inválido o expiró. Solicita uno nuevo.');

  if (!usuario || !usuario.reset_password_token_hash || !usuario.reset_password_expira) throw invalido();
  if (usuario.reset_password_expira < new Date()) throw invalido();

  // Comparación en tiempo constante: evita que un atacante infiera el hash
  // correcto midiendo cuánto tarda la respuesta (timing attack).
  const hashRecibido = Buffer.from(sha256Hex(token));
  const hashEsperado = Buffer.from(usuario.reset_password_token_hash);
  if (hashRecibido.length !== hashEsperado.length || !crypto.timingSafeEqual(hashRecibido, hashEsperado)) throw invalido();

  usuario.password_hash = await hashPassword(nueva);
  usuario.password_updated_at = new Date();
  usuario.debe_cambiar_pass = false;
  usuario.reset_password_token_hash = null;
  usuario.reset_password_expira = null;
  usuario.intentos_fallidos = 0;
  usuario.bloqueado_hasta = null;
  await usuario.save();
  await logoutAll(usuario.id); // por si el robo del token vino de una sesión comprometida
}

module.exports = {
  login,
  completarLoginMfa,
  refreshSession,
  logout,
  logoutAll,
  resolvePermisos,
  cambiarPassword,
  solicitarRecuperacion,
  restablecerPassword,
};
