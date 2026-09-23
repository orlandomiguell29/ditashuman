const crypto = require('crypto');
const env = require('../config/env');

// AES-256-GCM para cifrar en reposo datos sensibles como el secreto TOTP de MFA.
// La clave se guarda fuera del código (variable de entorno / secret manager),
// nunca en el repositorio.
//
// La clave AES-256 se deriva con SHA-256 en vez de simplemente
// `padEnd(32,'0').slice(0,32)` sobre el string de la env var. Antes, si
// `MFA_ENCRYPTION_KEY` tenía más de 32 caracteres (algo fácil de hacer sin
// querer, ej. pegando una clave hexadecimal de 64 caracteres generada con
// `openssl rand -hex 32`), se truncaba en silencio a los primeros 32 bytes
// — sin error, sin aviso — descartando la mitad de la entropía real de la
// clave configurada. Un hash SHA-256 usa el secreto COMPLETO como entrada y
// siempre produce exactamente 32 bytes, sin truncar ni rellenar nada.
const KEY = crypto.createHash('sha256').update(env.MFA_ENCRYPTION_KEY).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decrypt(buffer) {
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { encrypt, decrypt, sha256Hex };
