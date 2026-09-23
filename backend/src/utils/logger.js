const { createLogger, format, transports } = require('winston');

// Logger centralizado. En producción se recomienda enviar los logs a un
// colector externo (ELK, CloudWatch, Datadog) en vez de solo a archivo/consola,
// y jamás loguear contraseñas, tokens completos o datos de salud en claro.
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = logger;
