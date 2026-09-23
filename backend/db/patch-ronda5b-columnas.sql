-- Patch complementario a patch-ronda5.sql: ese script solo CREA tablas que
-- faltaban por completo, pero no repara tablas que ya existían de una
-- versión anterior del esquema y les faltan columnas nuevas (por ejemplo,
-- `expediente_documentos` sin la columna `activo`, causando el error real
-- "Unknown column 'activo' in 'SELECT'" en /colaborador/expediente).
--
-- Usa ADD COLUMN IF NOT EXISTS: es seguro correrlo aunque la columna ya
-- exista (no falla, simplemente no hace nada en ese caso). Soportado en
-- MySQL 8.0.29+ y en MariaDB (lo que trae XAMPP normalmente) desde hace
-- varias versiones.
--
-- Cómo aplicarlo:
--   mysql -u root -P 3308 ditash_app < db/patch-ronda5b-columnas.sql
-- o pégalo en phpMyAdmin > pestaña SQL, sobre tu base ditash_app.

-- expediente_documentos
ALTER TABLE expediente_documentos ADD COLUMN IF NOT EXISTS verificado TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE expediente_documentos ADD COLUMN IF NOT EXISTS activo TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE expediente_documentos ADD COLUMN IF NOT EXISTS hash_sha256 CHAR(64) NOT NULL DEFAULT '';
ALTER TABLE expediente_documentos ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- encuestas_clima
ALTER TABLE encuestas_clima ADD COLUMN IF NOT EXISTS anonima TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE encuestas_clima ADD COLUMN IF NOT EXISTS estado ENUM('borrador','activa','cerrada') NOT NULL DEFAULT 'borrador';
ALTER TABLE encuestas_clima ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- encuesta_preguntas
ALTER TABLE encuesta_preguntas ADD COLUMN IF NOT EXISTS orden SMALLINT UNSIGNED NOT NULL DEFAULT 0;

-- objetivos_okr
ALTER TABLE objetivos_okr ADD COLUMN IF NOT EXISTS estado ENUM('activo','completado','cancelado') NOT NULL DEFAULT 'activo';

-- curso_videos (por si la tabla ya existía de un intento anterior sin `activo`)
ALTER TABLE curso_videos ADD COLUMN IF NOT EXISTS activo TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE curso_videos ADD COLUMN IF NOT EXISTS orden SMALLINT UNSIGNED NOT NULL DEFAULT 0;
