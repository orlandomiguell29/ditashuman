const { google } = require('googleapis');
const crypto = require('crypto');
const env = require('../config/env');
const { encrypt, decrypt } = require('./crypto');
const { GoogleIntegracion } = require('../models');

// Google NUNCA permite fabricar un enlace meet.google.com/xxx-yyyy-zzz
// "a mano": solo los entrega su propia API cuando se crea un evento de
// Calendar con `conferenceData.createRequest`. Por eso este módulo, a
// diferencia de utils/videollamada.js (Jitsi), necesita credenciales OAuth
// reales conectadas por un administrador — ver integracionesController.js.

function credencialesConfiguradas() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

// Valida que lo que hay en las variables de entorno TENGA FORMA de
// credenciales OAuth reales de Google Cloud Console, y no, por ejemplo, el
// correo/contraseña de una cuenta de Gmail (el error más común al
// configurar esta integración). Sin esto, el error solo aparecía DESPUÉS
// de salir de nuestra app, en la propia pantalla de Google ("Error 401:
// invalid_client"), sin ninguna pista de cuál era el problema real.
function erroresFormatoCredenciales() {
  const id = (env.GOOGLE_CLIENT_ID || '').trim();
  const secret = (env.GOOGLE_CLIENT_SECRET || '').trim();
  const errores = [];

  if (id.includes('@')) {
    errores.push(
      'GOOGLE_CLIENT_ID parece un correo electrónico. Debe ser el "ID de cliente" de OAuth que entrega Google Cloud Console ' +
        '(un texto largo que termina en ".apps.googleusercontent.com"), nunca el correo de una cuenta de Gmail.'
    );
  } else if (!id.endsWith('.apps.googleusercontent.com')) {
    errores.push(
      'GOOGLE_CLIENT_ID no tiene el formato esperado (debería terminar en ".apps.googleusercontent.com"). ' +
        'Revisa que copiaste el "ID de cliente" completo desde Google Cloud Console → APIs y servicios → Credenciales → tu credencial OAuth 2.0.'
    );
  }

  if (secret.includes('@') || /\s/.test(secret)) {
    errores.push(
      'GOOGLE_CLIENT_SECRET no parece un secreto de cliente OAuth válido (contiene "@" o espacios, como si fuera una contraseña de correo). ' +
        'Debe ser el valor "Secreto del cliente" que muestra Google Cloud Console, normalmente empieza con "GOCSPX-".'
    );
  } else if (secret.length < 16) {
    errores.push(
      'GOOGLE_CLIENT_SECRET se ve demasiado corto para ser un secreto de cliente OAuth real. Verifica que copiaste el valor completo desde Google Cloud Console.'
    );
  }

  return errores;
}

function crearOAuthClient() {
  if (!credencialesConfiguradas()) {
    throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET no están configurados en el .env del backend.');
  }
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

// Paso 1 del flujo OAuth: URL a la que se redirige al SUPER_ADMIN para que
// autorice a DITASH a crear eventos en el calendario de la cuenta elegida.
// `access_type: 'offline'` + `prompt: 'consent'` son necesarios para que
// Google entregue un refresh_token (si no, solo da un access_token de
// corta duración que no sirve para crear reuniones días/semanas después).
function generarUrlConexion(state) {
  const client = crearOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'],
    state,
  });
}

// Paso 2: intercambia el `code` que Google manda al callback por tokens, y
// persiste el refresh_token cifrado. Solo se guarda UNA fila (integración
// a nivel de plataforma): si ya existía una conexión anterior, se
// reemplaza — conectar de nuevo es la forma de "cambiar de cuenta".
async function completarConexion({ code, usuarioId }) {
  const client = crearOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google no devolvió un refresh_token. Esto pasa si la cuenta ya había autorizado la app antes sin revocar el acceso: ' +
        've a https://myaccount.google.com/permissions, quita el acceso de "DITASH Human+" y vuelve a intentar la conexión.'
    );
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: 'v2' });
  const { data: perfil } = await oauth2.userinfo.get();

  await GoogleIntegracion.destroy({ where: {} });
  await GoogleIntegracion.create({
    refresh_token_cifrado: encrypt(tokens.refresh_token),
    cuenta_email: perfil.email,
    conectado_por: usuarioId,
  });
  return { email: perfil.email };
}

async function obtenerIntegracion() {
  return GoogleIntegracion.findOne({ order: [['id', 'DESC']] });
}

async function estaConectado() {
  if (!credencialesConfiguradas()) return false;
  const integracion = await obtenerIntegracion();
  return Boolean(integracion);
}

async function desconectar() {
  await GoogleIntegracion.destroy({ where: {} });
}

async function clienteAutenticado() {
  const integracion = await obtenerIntegracion();
  if (!integracion) return null;
  const client = crearOAuthClient();
  client.setCredentials({ refresh_token: decrypt(integracion.refresh_token_cifrado) });
  return client;
}

// Crea el evento de Calendar con videollamada de Google Meet y devuelve el
// enlace real (hangoutLink). Si la integración no está conectada, retorna
// `null` para que quien llama pueda decidir el fallback (ver
// colaboradorController.agendarCita, que cae a Jitsi si esto da null).
async function crearReunionMeet({ resumen, descripcion, inicio, fin, invitadosEmails = [] }) {
  const auth = await clienteAutenticado();
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth });
  const { data: evento } = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'none', // las notificaciones a los invitados las maneja el propio correo de DITASH (utils/mailer.js), no Google
    requestBody: {
      summary: resumen,
      description: descripcion,
      start: { dateTime: new Date(inicio).toISOString() },
      end: { dateTime: new Date(fin).toISOString() },
      attendees: invitadosEmails.filter(Boolean).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  return evento.hangoutLink || null;
}

module.exports = {
  credencialesConfiguradas,
  erroresFormatoCredenciales,
  generarUrlConexion,
  completarConexion,
  estaConectado,
  obtenerIntegracion,
  desconectar,
  crearReunionMeet,
};
