const { z } = require('zod');
const { Usuario } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { verifyPassword } = require('../utils/password');
const { generarSecreto, cifrarSecreto, descifrarSecreto, generarQrCode, verificarCodigo } = require('../utils/mfa');

// Autenticación de dos factores (TOTP, RFC 6238) para roles administrativos.
// Flujo de enrolamiento en 2 pasos, deliberadamente: `iniciar` genera y
// guarda el secreto cifrado pero NO activa el MFA todavía (mfa_habilitado
// sigue en false) — así, si el usuario nunca completa el escaneo del QR ni
// confirma un código válido, su cuenta sigue entrando solo con contraseña
// en vez de quedar en un estado a medias donde nadie puede generar el
// código correcto. Recién `activar` (tras verificar un código real de la
// app autenticadora) pone mfa_habilitado en true.

async function iniciarEnrolamiento(req, res, next) {
  try {
    const usuario = await Usuario.scope('conAuth').findByPk(req.user.id);
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');
    if (usuario.mfa_habilitado) throw new HttpError(409, 'Ya tienes MFA habilitado. Desactívalo primero si quieres reconfigurarlo.');

    const secreto = generarSecreto();
    usuario.mfa_secret_cifrado = cifrarSecreto(secreto);
    await usuario.save();

    const qrCodeDataUrl = await generarQrCode({ email: usuario.email, secreto });
    await registrarAuditoria({ req, accion: 'mfa_iniciar_enrolamiento' });

    // El secreto en texto se entrega UNA vez, para quien no pueda escanear
    // el QR (entrada manual en la app autenticadora). No se vuelve a
    // exponer después de este paso.
    res.json({ qrCodeDataUrl, secreto });
  } catch (err) {
    next(err);
  }
}

const activarSchema = z.object({
  body: z.object({ codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.') }).strict(),
  query: z.any(),
  params: z.any(),
});

async function activar(req, res, next) {
  try {
    const usuario = await Usuario.scope('conAuth').findByPk(req.user.id);
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');
    if (usuario.mfa_habilitado) throw new HttpError(409, 'El MFA ya está activo.');
    if (!usuario.mfa_secret_cifrado) throw new HttpError(400, 'Primero inicia el enrolamiento para generar un código QR.');

    const secreto = descifrarSecreto(usuario.mfa_secret_cifrado);
    if (!verificarCodigo({ codigo: req.body.codigo, secreto })) {
      throw new HttpError(400, 'Código incorrecto. Verifica la hora de tu dispositivo e intenta de nuevo.');
    }

    usuario.mfa_habilitado = true;
    await usuario.save();
    await registrarAuditoria({ req, accion: 'mfa_activado' });
    res.json({ mensaje: 'Autenticación de dos factores activada.' });
  } catch (err) {
    next(err);
  }
}

const desactivarSchema = z.object({
  body: z.object({ password: z.string().min(1) }).strict(),
  query: z.any(),
  params: z.any(),
});

// Exige la contraseña actual (no basta con la sesión activa) para
// desactivar el segundo factor: si un atacante robó una sesión ya abierta,
// no debería poder quitarle la protección MFA a la cuenta sin conocer
// también la contraseña.
async function desactivar(req, res, next) {
  try {
    const usuario = await Usuario.scope('conAuth').findByPk(req.user.id);
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

    const ok = await verifyPassword(usuario.password_hash, req.body.password);
    if (!ok) throw new HttpError(400, 'La contraseña no es correcta.');

    usuario.mfa_habilitado = false;
    usuario.mfa_secret_cifrado = null;
    await usuario.save();
    await registrarAuditoria({ req, accion: 'mfa_desactivado' });
    res.json({ mensaje: 'Autenticación de dos factores desactivada.' });
  } catch (err) {
    next(err);
  }
}

async function estado(req, res, next) {
  try {
    const usuario = await Usuario.findByPk(req.user.id, { attributes: ['mfa_habilitado'] });
    res.json({ data: { mfaHabilitado: !!usuario?.mfa_habilitado } });
  } catch (err) {
    next(err);
  }
}

module.exports = { iniciarEnrolamiento, activar, desactivar, estado, activarSchema, desactivarSchema };
