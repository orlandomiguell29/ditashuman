-- =============================================================================
-- Elimina cursos duplicados en la tabla `cursos`.
--
-- CAUSA RAÍZ (ya corregida en el código, ver db/seed.js): el seed insertaba
-- los 5 cursos de ejemplo con `bulkCreate(..., { ignoreDuplicates: true })`,
-- pero `cursos.titulo` no tiene una restricción UNIQUE en la base de datos,
-- así que `ignoreDuplicates` no detectaba nada que ignorar. Como el backend
-- corre este seed en cada arranque (autoRepair.js), cada reinicio (típico
-- con nodemon en desarrollo) insertaba los mismos cursos otra vez con un id
-- nuevo. Este script limpia los duplicados que ya quedaron en tu base.
--
-- QUÉ HACE: por cada título repetido, conserva el curso con el id MÁS
-- ANTIGUO (el "original") y elimina el resto, reubicando o limpiando antes
-- lo que dependía de los duplicados para no romper llaves foráneas:
--   - inscripciones_cursos / inscripcion_curso_videos de los duplicados: se
--     eliminan (si un colaborador se inscribió justo en un curso duplicado,
--     esa inscripción puntual se pierde; el curso "original" y sus propias
--     inscripciones NO se tocan).
--   - curso_preguntas de los duplicados: se eliminan (el curso original
--     conserva las suyas).
--   - planes_desarrollo que apuntaban a un duplicado: se reubican al curso
--     original (no se pierden).
--   - curso_videos de los duplicados: se eliminan automáticamente por
--     ON DELETE CASCADE al borrar el curso.
--
-- CÓMO USARLO: pégalo completo en phpMyAdmin (pestaña SQL de tu base
-- `ditash` o como se llame) y ejecútalo una sola vez. Es seguro volver a
-- correrlo (si no hay duplicados, no hace nada).
-- =============================================================================

SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_cursos_conservar;
CREATE TEMPORARY TABLE tmp_cursos_conservar AS
SELECT titulo, MIN(id) AS id_conservar
FROM cursos
GROUP BY titulo;

DROP TEMPORARY TABLE IF EXISTS tmp_cursos_eliminar;
CREATE TEMPORARY TABLE tmp_cursos_eliminar AS
SELECT c.id AS id
FROM cursos c
JOIN tmp_cursos_conservar t ON t.titulo = c.titulo
WHERE c.id <> t.id_conservar;

-- Progreso de video visto en inscripciones de los cursos duplicados.
DELETE icv FROM inscripcion_curso_videos icv
JOIN inscripciones_cursos ic ON ic.id = icv.inscripcion_id
WHERE ic.curso_id IN (SELECT id FROM tmp_cursos_eliminar);

-- Inscripciones hechas sobre un curso duplicado.
DELETE FROM inscripciones_cursos
WHERE curso_id IN (SELECT id FROM tmp_cursos_eliminar);

-- Preguntas de evaluación final creadas sobre un curso duplicado.
DELETE FROM curso_preguntas
WHERE curso_id IN (SELECT id FROM tmp_cursos_eliminar);

-- Planes de desarrollo (PID) que recomendaban un curso duplicado: se
-- reubican al curso original en vez de perderse.
UPDATE planes_desarrollo pd
JOIN cursos c ON c.id = pd.curso_id
JOIN tmp_cursos_conservar t ON t.titulo = c.titulo
SET pd.curso_id = t.id_conservar
WHERE pd.curso_id IN (SELECT id FROM tmp_cursos_eliminar);

-- Por último, borra los cursos duplicados. Sus `curso_videos` se eliminan
-- solos por ON DELETE CASCADE.
DELETE FROM cursos WHERE id IN (SELECT id FROM tmp_cursos_eliminar);

DROP TEMPORARY TABLE IF EXISTS tmp_cursos_conservar;
DROP TEMPORARY TABLE IF EXISTS tmp_cursos_eliminar;

COMMIT;
SET SQL_SAFE_UPDATES = 1;

-- Verificación: esto debe devolver 0 filas (ningún título repetido).
SELECT titulo, COUNT(*) AS repeticiones
FROM cursos
GROUP BY titulo
HAVING COUNT(*) > 1;
