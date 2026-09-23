/* eslint-disable no-console */
// Auto-reparación de esquema + datos de demostración, ejecutada UNA vez en
// cada arranque del backend (ver server.js).
//
// Por qué existe: durante el desarrollo, varias rondas de cambios le
// agregaron columnas nuevas a tablas que el usuario ya tenía creadas en su
// MySQL local (XAMPP) desde una versión anterior del esquema. Entregar
// parches .sql sueltos (`db/patch-ronda5.sql`, `db/patch-ronda5b-columnas.sql`)
// para que el usuario los pegara a mano en phpMyAdmin resultó ser un punto
// de falla constante: si un paso se saltaba u olvidaba, el síntoma era un
// 500 en el backend o una pantalla "0 preguntas" sin ningún mensaje que
// apuntara a la causa real.
//
// Esta función hace exactamente lo mismo que esos parches, pero SOLA, cada
// vez que arranca `npm run dev` / `npm start` — así el esquema y los datos
// de ejemplo (roles, catálogos, especialista demo, encuesta de clima con
// sus preguntas, videos de YouTube por curso) quedan siempre correctos sin
// que el usuario tenga que ejecutar nada manualmente nunca más.
//
// Es seguro correrla repetidas veces: cada paso revisa el estado actual de
// information_schema antes de tocar nada, y el seed es idempotente.
const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function columnaExiste(tabla, columna) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    { replacements: [tabla, columna] }
  );
  return Number(rows[0].n) > 0;
}

async function tablaExiste(tabla) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    { replacements: [tabla] }
  );
  return Number(rows[0].n) > 0;
}

// No se usa `ADD COLUMN IF NOT EXISTS` (sintaxis de MySQL 8.0.29+/MariaDB
// recientes) porque no todas las instalaciones de XAMPP la soportan: se
// verifica a mano contra information_schema, que funciona en cualquier
// versión de MySQL/MariaDB.
async function asegurarColumna(tabla, columna, definicionSql) {
  try {
    if (!(await tablaExiste(tabla))) return; // la tabla se crea más abajo si falta
    if (await columnaExiste(tabla, columna)) return;
    await sequelize.query(`ALTER TABLE \`${tabla}\` ADD COLUMN ${definicionSql}`);
    logger.info(`[autoRepair] Columna agregada: ${tabla}.${columna}`);
  } catch (err) {
    logger.error(`[autoRepair] No fue posible asegurar ${tabla}.${columna}`, { error: err.message });
  }
}

async function asegurarTablasBase() {
  // `sync({ alter: false })` con los modelos ya define correctamente las
  // tablas que aún no existan (CREATE TABLE), respetando los tipos de
  // Sequelize — más confiable que mantener un CREATE TABLE SQL duplicado a
  // mano. No usa `alter: true` a propósito: eso podría intentar modificar
  // columnas existentes de formas inesperadas; el ajuste fino de columnas
  // puntuales lo hace `asegurarColumna` arriba, explícito y controlado.
  try {
    await sequelize.sync({ alter: false });
  } catch (err) {
    logger.error('[autoRepair] sequelize.sync() falló', { error: err.message });
  }
}

async function repararEsquema() {
  await asegurarTablasBase();

  await asegurarColumna('expediente_documentos', 'verificado', "verificado TINYINT(1) NOT NULL DEFAULT 0");
  await asegurarColumna('expediente_documentos', 'activo', "activo TINYINT(1) NOT NULL DEFAULT 1");
  await asegurarColumna('expediente_documentos', 'hash_sha256', "hash_sha256 CHAR(64) NOT NULL DEFAULT ''");
  await asegurarColumna('expediente_documentos', 'created_at', 'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');

  await asegurarColumna('encuestas_clima', 'anonima', 'anonima TINYINT(1) NOT NULL DEFAULT 1');
  await asegurarColumna('encuestas_clima', 'estado', "estado ENUM('borrador','activa','cerrada') NOT NULL DEFAULT 'borrador'");
  await asegurarColumna('encuestas_clima', 'created_at', 'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');

  // Esta es la columna cuya ausencia dejaba la encuesta demo en "0
  // preguntas" de forma permanente: sin `orden`, el `findOrCreate` por
  // (encuesta_id, orden) del seed no podía ni siquiera intentar el INSERT.
  await asegurarColumna('encuesta_preguntas', 'orden', 'orden SMALLINT UNSIGNED NOT NULL DEFAULT 0');

  await asegurarColumna('objetivos_okr', 'estado', "estado ENUM('activo','completado','cancelado') NOT NULL DEFAULT 'activo'");

  await asegurarColumna('curso_videos', 'activo', 'activo TINYINT(1) NOT NULL DEFAULT 1');
  await asegurarColumna('curso_videos', 'orden', 'orden SMALLINT UNSIGNED NOT NULL DEFAULT 0');

  // Evaluación final de curso (el certificado ya no depende solo de ver
  // los videos): la tabla `curso_preguntas` es nueva y la crea
  // `sequelize.sync()` de arriba; estas 3 columnas se agregan sobre
  // `inscripciones_cursos`, que ya existía antes de esta funcionalidad.
  await asegurarColumna('inscripciones_cursos', 'quiz_intentos', 'quiz_intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0');
  await asegurarColumna('inscripciones_cursos', 'quiz_mejor_puntaje', 'quiz_mejor_puntaje TINYINT UNSIGNED NOT NULL DEFAULT 0');
  await asegurarColumna('inscripciones_cursos', 'quiz_aprobado', 'quiz_aprobado TINYINT(1) NOT NULL DEFAULT 0');

  // Número de intentos de evaluación parametrizable por curso (antes era un
  // valor fijo de 2 en el código, igual para todos los cursos).
  await asegurarColumna('cursos', 'max_intentos_evaluacion', 'max_intentos_evaluacion SMALLINT UNSIGNED NOT NULL DEFAULT 2');

  // `curso_id`/`categoria_id` en planes_desarrollo: instalaciones viejas
  // pueden no tenerlas todavía si la tabla se creó antes de esta función.
  await asegurarColumna('planes_desarrollo', 'curso_id', 'curso_id BIGINT UNSIGNED NULL');
  await asegurarColumna('planes_desarrollo', 'categoria_id', 'categoria_id BIGINT UNSIGNED NULL');

  // Evaluaciones de desempeño tipo cuestionario (sí/no, numérica, texto
  // libre): `evaluacion_preguntas`/`evaluacion_respuestas` son tablas
  // nuevas y las crea `sequelize.sync()` de arriba; estas columnas se
  // agregan sobre `evaluaciones`, que ya existía antes de esta funcionalidad.
  await asegurarColumna('evaluaciones', 'respondida_en', 'respondida_en DATETIME NULL');
  await asegurarColumna('evaluaciones', 'nota_parcial', 'nota_parcial DECIMAL(6,2) NULL');
  await asegurarColumna('evaluaciones', 'nota_final', 'nota_final DECIMAL(6,2) NULL');
  await asegurarColumna('evaluaciones', 'puntos_totales', 'puntos_totales DECIMAL(6,2) NULL');
  await asegurarColumna('evaluaciones', 'requiere_calificacion_manual', 'requiere_calificacion_manual TINYINT(1) NOT NULL DEFAULT 0');

  // Duración de reunión parametrizable por especialista (antes fija en 60
  // minutos, hardcodeada en frontend y backend). Ver models/index.js.
  await asegurarColumna('especialistas', 'duracion_minutos', 'duracion_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 60');
}

async function autoRepararTodo() {
  try {
    logger.info('[autoRepair] Verificando esquema y datos de demostración…');
    await repararEsquema();

    // Reutiliza el mismo seed idempotente de `npm run seed` (roles,
    // permisos, catálogos, curso_videos, especialista demo verificado,
    // encuesta de clima con sus 4 preguntas). Si esto falla, se registra el
    // error completo pero NO se detiene el arranque del servidor: es mejor
    // que la API quede arriba (aunque falte un dato de ejemplo) a que el
    // usuario se quede sin backend por un problema de datos semilla.
    // eslint-disable-next-line global-require
    const { ejecutarSeed } = require('../../db/seed');
    await ejecutarSeed();

    // Diagnóstico explícito al arrancar: si esto muestra 0, el bloque del
    // seed que auto-sana la encuesta demo (findOrCreate por encuesta_id +
    // orden, ver db/seed.js) no está insertando nada — revisar el mensaje
    // de error justo arriba en la consola/logs/error.log para la causa real
    // (columna faltante, conexión a MySQL, etc.). Si muestra 4, el backend
    // SÍ está guardando preguntas correctamente y cualquier encuesta que
    // siga en "0 preguntas" en la interfaz es una encuesta DISTINTA (creada
    // a mano) que necesita arreglarse desde "Administrar preguntas".
    // eslint-disable-next-line global-require
    const { EncuestaClima, EncuestaPregunta } = require('../models');
    const demo = await EncuestaClima.findOne({ where: { titulo: 'Clima organizacional — Trimestre actual' } });
    const totalPreguntasDemo = demo ? await EncuestaPregunta.count({ where: { encuesta_id: demo.id } }) : null;
    logger.info(`[autoRepair] Preguntas de la encuesta demo: ${totalPreguntasDemo ?? 'encuesta demo no encontrada'}`);

    logger.info('[autoRepair] Esquema y datos de demostración verificados correctamente.');
  } catch (err) {
    logger.error('[autoRepair] Falló la auto-reparación (el servidor sigue arrancando igual)', {
      error: err.message,
      stack: err.stack,
    });
  }
}

module.exports = { autoRepararTodo };
