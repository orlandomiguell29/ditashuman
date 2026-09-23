// Catálogo central de módulos/acciones. Es la ÚNICA fuente de verdad de qué
// permisos existen en el sistema; el seed y las rutas lo referencian para
// no tener strings "mágicos" repetidos y desalineados entre capas.
const MODULOS = [
  'usuarios',
  'roles',
  'permisos',
  'empresas',
  'colaboradores',
  'especialistas',
  'citas',
  'cursos',
  'evaluaciones',
  'okrs',
  'clima',
  'expedientes',
  'comisiones',
  'categorias',
  'auditoria',
];

// 'inactivar' reemplaza al tradicional 'eliminar': el sistema nunca borra
// registros de negocio, solo los inactiva (ver crudFactory.js). Nombrar la
// acción como lo que realmente hace evita confundir a quien gestiona roles.
const ACCIONES = ['crear', 'leer', 'actualizar', 'inactivar', 'exportar'];

function codigo(modulo, accion) {
  return `${modulo}.${accion}`;
}

function catalogoCompleto() {
  const out = [];
  for (const modulo of MODULOS) {
    for (const accion of ACCIONES) {
      out.push({ modulo, accion, codigo: codigo(modulo, accion) });
    }
  }
  return out;
}

module.exports = { MODULOS, ACCIONES, codigo, catalogoCompleto };
