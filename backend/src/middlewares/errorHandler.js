const logger = require('../utils/logger');
const env = require('../config/env');

// Manejador de errores centralizado. Nunca se filtran stack traces ni
// mensajes internos de Sequelize/MySQL al cliente en producción (evita
// fuga de estructura de BD, útil para un atacante).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'El registro ya existe (violación de unicidad).' });
  }
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ error: 'Datos inválidos o referencia inexistente.' });
  }
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
  }

  const status = err.status || 500;
  const publicMessage = status < 500 ? err.message : 'Error interno del servidor.';
  return res.status(status).json({
    error: publicMessage,
    ...(env.NODE_ENV !== 'production' && status >= 500 ? { debug: err.message } : {}),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado.' });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { errorHandler, notFoundHandler, HttpError };
