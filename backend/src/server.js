process.env.TZ = 'America/Bogota';
const fs = require('fs');
const env = require('./config/env');
const app = require('./app');
const sequelize = require('./config/database');
const logger = require('./utils/logger');
const { autoRepararTodo } = require('./startup/autoRepair');

async function start() {
  try {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

    await sequelize.authenticate();
    logger.info('✅ Conexión a MySQL establecida correctamente.');

    // Auto-repara columnas/tablas faltantes y re-siembra los datos de
    // demostración en CADA arranque (ver src/startup/autoRepair.js). Así el
    // esquema y el contenido de ejemplo (encuesta de clima con preguntas,
    // videos de cursos, especialista verificado) siempre quedan correctos
    // sin depender de correr `npm run seed` ni parches .sql a mano.
    await autoRepararTodo();

    app.listen(env.PORT, () => {
      logger.info(`🚀 API DITASH escuchando en http://localhost:${env.PORT}`);
    });
  } catch (err) {
    logger.error('❌ No fue posible iniciar el servidor', { error: err.message });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});

start();
