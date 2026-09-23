const argon2 = require('argon2');

// Argon2id: ganador del Password Hashing Competition, recomendado por OWASP
// por encima de bcrypt para nuevos desarrollos (mejor resistencia a ataques
// con GPU/ASIC gracias al costo de memoria configurable).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, recomendación mínima OWASP 2024
  timeCost: 2,
  parallelism: 1,
};

async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, OPTIONS);
}

async function verifyPassword(hash, plainPassword) {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    return false;
  }
}

// Política de contraseñas: mínimo 8 caracteres, mayúscula, minúscula, número y símbolo.
// Se valida en la capa de esquemas (zod) pero se centraliza aquí la regex para reutilizar.
const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;

module.exports = { hashPassword, verifyPassword, PASSWORD_POLICY_REGEX };
