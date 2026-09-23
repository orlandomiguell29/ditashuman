const { z } = require('zod');
const { crudFactory } = require('../utils/crudFactory');
const { Empresa } = require('../models');

const ctrl = crudFactory({
  model: Empresa,
  entidad: 'empresas',
  exportColumns: [
    { header: 'ID', key: 'id' },
    { header: 'Nombre', key: 'nombre' },
    { header: 'NIT', key: 'nit' },
    { header: 'Plan', key: 'plan' },
    { header: 'Activo', key: 'activo' },
  ],
});

const empresaSchema = z.object({
  body: z
    .object({
      nombre: z.string().min(2).max(150),
      nit: z
        .string()
        .min(5)
        .max(30)
        .regex(/^[0-9]{5,15}-?[0-9kK]?$/, 'Formato de NIT inválido (solo dígitos y guión opcional de verificación).'),
      plan: z.enum(['basico', 'profesional', 'enterprise']).default('basico'),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

const empresaUpdateSchema = z.object({
  body: z
    .object({
      nombre: z.string().min(2).max(150).optional(),
      plan: z.enum(['basico', 'profesional', 'enterprise']).optional(),
      // El NIT es la identidad fiscal de la empresa: cambiarlo por error
      // desalinearía toda la facturación/reportes históricos, así que no se
      // permite editar desde este endpoint (requeriría un proceso aparte
      // con doble verificación).
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

module.exports = { ...ctrl, empresaSchema, empresaUpdateSchema };
