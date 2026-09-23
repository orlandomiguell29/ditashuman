const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('./logger');

// Correo transaccional real vía SMTP (se sugiere Brevo en el README: 300
// correos/día gratis, sin tarjeta de crédito). El proveedor es
// intercambiable: cualquier SMTP estándar (Gmail con contraseña de app,
// SendGrid, Amazon SES, Mailgun, tu propio Postfix) funciona con las mismas
// 5 variables de entorno — no hay acoplamiento a un proveedor específico.
//
// Si SMTP_HOST no está configurado (típico en desarrollo local, donde nadie
// quiere una cuenta SMTP real para probar), el correo NO se descarta
// silenciosamente: se registra su contenido completo en el logger para que
// el desarrollador pueda ver exactamente qué se habría enviado (el enlace
// de recuperación, la contraseña temporal, etc.) sin necesitar credenciales.
let transporter = null;
function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function enviarCorreo({ to, subject, html, text }) {
  const remitente = env.SMTP_FROM || 'DITASH Human+ <no-reply@ditash.local>';
  const t = getTransporter();

  if (!t) {
    logger.warn('[mailer] SMTP no configurado — correo NO enviado, se registra el contenido para depuración', {
      to,
      subject,
      cuerpo: text || html,
    });
    return { simulado: true };
  }

  try {
    const info = await t.sendMail({ from: remitente, to, subject, html, text });
    logger.info('[mailer] Correo enviado', { to, subject, messageId: info.messageId });
    return { simulado: false, messageId: info.messageId };
  } catch (err) {
    // Un fallo de envío de correo (SMTP caído, credenciales vencidas) NUNCA
    // debe tumbar la operación de negocio que lo disparó (crear usuario,
    // resetear contraseña): se registra el error y se sigue.
    logger.error('[mailer] Falló el envío de correo', { to, subject, error: err.message });
    return { simulado: false, error: err.message };
  }
}

function plantillaBase(titulo, cuerpoHtml) {
  return `
    <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #334155;">
      <h2 style="color: #4f46e5;">DITASH <span style="color:#0f172a;">Human+</span></h2>
      <h3>${titulo}</h3>
      ${cuerpoHtml}
      <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        Este es un correo automático, no respondas a esta dirección.
      </p>
    </div>`;
}

async function correoRecuperacionPassword({ to, nombre, enlace }) {
  return enviarCorreo({
    to,
    subject: 'Recupera tu contraseña — DITASH Human+',
    html: plantillaBase('Recuperación de contraseña', `
      <p>Hola ${nombre},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Este enlace es válido por 30 minutos:</p>
      <p><a href="${enlace}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Restablecer contraseña</a></p>
      <p>Si no fuiste tú, ignora este correo — tu contraseña actual sigue siendo válida.</p>
    `),
    text: `Restablece tu contraseña en: ${enlace} (válido 30 minutos)`,
  });
}

async function correoPasswordTemporal({ to, nombre, passwordTemporal }) {
  return enviarCorreo({
    to,
    subject: 'Tu contraseña temporal — DITASH Human+',
    html: plantillaBase('Contraseña temporal generada', `
      <p>Hola ${nombre},</p>
      <p>Un administrador generó una contraseña temporal para tu cuenta:</p>
      <p style="font-size:18px;font-weight:bold;background:#f8fafc;padding:10px;border-radius:6px;">${passwordTemporal}</p>
      <p>Se te pedirá cambiarla al iniciar sesión.</p>
    `),
    text: `Tu contraseña temporal es: ${passwordTemporal} (se te pedirá cambiarla al ingresar)`,
  });
}

async function correoBienvenida({ to, nombre, passwordTemporal }) {
  return enviarCorreo({
    to,
    subject: 'Bienvenido a DITASH Human+',
    html: plantillaBase(`¡Bienvenido, ${nombre}!`, `
      <p>Tu cuenta en DITASH Human+ fue creada. Estos son tus datos de acceso:</p>
      <p>Usuario: <strong>${to}</strong><br/>Contraseña temporal: <strong>${passwordTemporal}</strong></p>
      <p>Se te pedirá que la cambies la primera vez que ingreses.</p>
    `),
    text: `Bienvenido a DITASH. Usuario: ${to} — Contraseña temporal: ${passwordTemporal}`,
  });
}

async function correoCitaAgendada({ to, nombreColaborador, nombreEspecialista, fechaHora, enlaceReunion }) {
  return enviarCorreo({
    to,
    subject: 'Cita confirmada — DITASH Human+',
    html: plantillaBase('Tu cita fue agendada', `
      <p>Hola ${nombreColaborador},</p>
      <p>Tu cita con <strong>${nombreEspecialista}</strong> quedó agendada para el <strong>${new Date(fechaHora).toLocaleString('es-CO')}</strong>.</p>
      ${enlaceReunion ? `<p><a href="${enlaceReunion}">Enlace de la videollamada</a></p>` : ''}
    `),
    text: `Cita con ${nombreEspecialista} el ${new Date(fechaHora).toLocaleString('es-CO')}. ${enlaceReunion || ''}`,
  });
}

module.exports = { enviarCorreo, correoRecuperacionPassword, correoPasswordTemporal, correoBienvenida, correoCitaAgendada };
