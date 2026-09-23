const { hashPassword, verifyPassword, PASSWORD_POLICY_REGEX } = require('../src/utils/password');

describe('Política de contraseñas y hashing (Argon2id)', () => {
  test('genera un hash distinto cada vez (salt aleatorio) y verifica correctamente', async () => {
    const hash1 = await hashPassword('ClaveSegura#123');
    const hash2 = await hashPassword('ClaveSegura#123');

    expect(hash1).not.toEqual(hash2);
    expect(await verifyPassword(hash1, 'ClaveSegura#123')).toBe(true);
    expect(await verifyPassword(hash1, 'ClaveIncorrecta')).toBe(false);
  });

  test.each([
    ['corta1A!', false],
    ['sinnumerosnisimbolos', false],
    ['minusculas123!!!!!!', false],
    ['Ditash#2026!', true],
  ])('valida la política para "%s" => %s', (plain, esperado) => {
    expect(PASSWORD_POLICY_REGEX.test(plain)).toBe(esperado);
  });
});
