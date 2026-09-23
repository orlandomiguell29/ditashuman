const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { encrypt, decrypt } = require('./crypto');

// TOTP (RFC 6238) estándar: compatible con Google Authenticator, Authy,
// 1Password, Microsoft Authenticator, etc. — cualquier app que lea un QR
// otpauth://, no una integración propietaria.
authenticator.options = { window: 1 }; // tolera 1 paso (±30s) de desfase de reloj entre servidor y celular

function generarSecreto() {
  return authenticator.generateSecret();
}

function cifrarSecreto(secretoTexto) {
  return encrypt(secretoTexto);
}

function descifrarSecreto(buffer) {
  return decrypt(buffer);
}

async function generarQrCode({ email, secreto }) {
  const otpauthUri = authenticator.keyuri(email, 'DITASH Human+', secreto);
  return QRCode.toDataURL(otpauthUri);
}

function verificarCodigo({ codigo, secreto }) {
  try {
    return authenticator.verify({ token: String(codigo).trim(), secret: secreto });
  } catch {
    return false;
  }
}

module.exports = { generarSecreto, cifrarSecreto, descifrarSecreto, generarQrCode, verificarCodigo };
