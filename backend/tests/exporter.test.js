const { toCsv } = require('../src/utils/exporter');

describe('Exportación CSV', () => {
  const columns = [
    { header: 'Nombre', key: 'nombre' },
    { header: 'Nota', key: 'nota' },
  ];

  test('escapa fórmulas peligrosas (mitigación de CSV injection)', () => {
    const csv = toCsv([{ nombre: '=cmd|"/c calc"!A1', nota: 'ok' }], columns);
    expect(csv).toContain("'=cmd");
  });

  test('escapa comas y comillas correctamente', () => {
    const csv = toCsv([{ nombre: 'Pérez, Juan "El Rápido"', nota: 'ok' }], columns);
    expect(csv).toContain('"Pérez, Juan ""El Rápido"""');
  });
});
