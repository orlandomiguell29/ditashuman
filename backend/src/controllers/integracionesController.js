const crypto = require('crypto');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const googleMeet = require('../utils/googleMeet');
const env = require('../config/env');

// Guarda un `state` de un solo uso para el flujo OAuth (mitiga CSRF sobre
// el propio callback de Google: sin esto, cualquiera podría intentar
// "colar" su código de autorización en nuestro callback). Vive solo en
// memoria del proceso porque el flujo completo (conectar -> Google ->
// callback) dura segundos, no necesita persistir en base de datos.
const statesPendientes = new Map(); // state -> { usuarioId, expira }
const TTL_STATE_MS = 10 * 60 * 1000;

function limpiarStatesVencidos() {
  const ahora = Date.now();
  for (const [state, info] of statesPendientes) {
    if (info.expira < ahora) statesPendientes.delete(state);
  }
}

// GET /admin/integraciones/google/conectar — redirige al consentimiento de
// Google. Requiere SUPER_ADMIN (ver rutas): conectar esta cuenta afecta a
// TODAS las citas con videollamada de toda la plataforma, no es una acción
// de un especialista individual.
async function conectar(req, res, next) {
  try {
    if (!googleMeet.credencialesConfiguradas()) {
      throw new HttpError(
        409,
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET no están configurados en el .env del backend. Revisa el README (sección Google Meet) para crearlos en Google Cloud Console.'
      );
    }
    // Se valida el FORMATO antes de siquiera intentar el redirect a Google:
    // así, si el problema es el error típico (pegar el correo/contraseña de
    // Gmail en vez del Client ID/Secret de OAuth), el usuario ve el motivo
    // exacto aquí mismo en vez de un "Error 401: invalid_client" genérico
    // en la propia pantalla de Google.
    const erroresFormato = googleMeet.erroresFormatoCredenciales();
    if (erroresFormato.length) {
      throw new HttpError(409, erroresFormato.join(' '));
    }
    limpiarStatesVencidos();
    const state = crypto.randomBytes(24).toString('hex');
    statesPendientes.set(state, { usuarioId: req.user.id, expira: Date.now() + TTL_STATE_MS });
    const url = googleMeet.generarUrlConexion(state);
    res.json({ data: { url } });
  } catch (err) {
    next(err);
  }
}

// GET /admin/integraciones/google/callback — a esta ruta redirige Google
// directamente en el navegador (no es una llamada XHR del frontend), por
// eso responde con HTML simple en vez de JSON: solo necesita avisarle al
// usuario que puede cerrar la pestaña y volver a la app.
async function callback(req, res) {
  const { code, state, error: errorGoogle } = req.query;
  limpiarStatesVencidos();
  const info = state && statesPendientes.get(String(state));
  if (info) statesPendientes.delete(String(state));

  function paginaResultado({ ok, mensaje }) {
    res.status(ok ? 200 : 400).send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Conexión con Google</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:${ok ? '#166534' : '#991b1b'}">
<h2>${ok ? '✅ Conectado' : '❌ No se pudo conectar'}</h2>
<p>${mensaje}</p>
<p style="color:#64748b;font-size:14px">Puedes cerrar esta pestaña y volver a DITASH Human+.</p>
</body></html>`);
  }

  if (errorGoogle) return paginaResultado({ ok: false, mensaje: `Google reportó: ${errorGoogle}` });
  if (!code || !info) return paginaResultado({ ok: false, mensaje: 'El enlace de conexión expiró o no es válido. Vuelve a intentarlo desde Admin > Integraciones.' });

  try {
    const { email } = await googleMeet.completarConexion({ code: String(code), usuarioId: info.usuarioId });
    await registrarAuditoria({ req, accion: 'conectar_google_meet', entidad: 'google_integracion', detalles: { email } });
    return paginaResultado({ ok: true, mensaje: `Cuenta ${email} conectada correctamente. Ya se pueden generar reuniones reales de Google Meet.` });
  } catch (err) {
    return paginaResultado({ ok: false, mensaje: err.message || 'Ocurrió un error inesperado.' });
  }
}

async function estado(req, res, next) {
  try {
    const conectado = await googleMeet.estaConectado();
    const integracion = conectado ? await googleMeet.obtenerIntegracion() : null;
    const credencialesConfiguradas = googleMeet.credencialesConfiguradas();
    res.json({
      data: {
        credencialesConfiguradas,
        // Se calcula aquí también (no solo al dar clic en "Conectar") para
        // que Admin > Integraciones pueda mostrar la advertencia de
        // formato de una vez, sin que el usuario tenga que hacer clic para
        // descubrir que el Client ID/Secret están mal.
        erroresFormatoCredenciales: credencialesConfiguradas ? googleMeet.erroresFormatoCredenciales() : [],
        conectado,
        cuentaEmail: integracion?.cuenta_email || null,
        conectadoEn: integracion?.conectado_en || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Versión mínima de /estado para cualquier usuario autenticado (no solo
// SUPER_ADMIN): el colaborador necesita saber si puede elegir "Google Meet"
// al agendar una cita, pero no tiene por qué ver la cuenta conectada.
async function estadoPublico(req, res, next) {
  try {
    res.json({ data: { disponible: await googleMeet.estaConectado() } });
  } catch (err) {
    next(err);
  }
}

async function desconectar(req, res, next) {
  try {
    await googleMeet.desconectar();
    await registrarAuditoria({ req, accion: 'desconectar_google_meet', entidad: 'google_integracion' });
    res.json({ mensaje: 'Cuenta de Google desconectada. Las nuevas citas volverán a usar Jitsi Meet.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { conectar, callback, estado, estadoPublico, desconectar };
