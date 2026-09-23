const { Auditoria } = require('../models');
const logger = require('../utils/logger');

// Registro de auditoría "best effort": si falla la escritura de auditoría,
// no debe tumbar la petición del usuario, pero sí queda constancia en logs.
async function registrarAuditoria({ req, accion, entidad, entidadId, detalles }) {
  try {
    await Auditoria.create({
      usuario_id: req.user?.id ?? null,
      accion,
      entidad: entidad ?? null,
      entidad_id: entidadId ?? null,
      detalles: detalles ?? null,
      ip: req.ip,
      user_agent: req.headers['user-agent']?.slice(0, 255) ?? null,
    });
  } catch (err) {
    logger.error('No se pudo registrar auditoría', { err: err.message });
  }
}

module.exports = { registrarAuditoria };
