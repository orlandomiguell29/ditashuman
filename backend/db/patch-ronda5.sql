-- Patch idempotente para bases de datos ya existentes (creadas antes de
-- esta ronda de cambios). Usa CREATE TABLE IF NOT EXISTS: es seguro
-- correrlo aunque algunas de estas tablas ya existan, no borra ni
-- modifica nada de lo que ya tengas.
--
-- Cómo aplicarlo (MySQL / XAMPP):
--   mysql -u root -P 3308 ditash_app < db/patch-ronda5.sql
-- o pégalo directo en phpMyAdmin > pestaña SQL, sobre tu base ditash_app.
--
-- Incluye, además de las tablas nuevas de video, las de encuestas de clima
-- y expediente digital: si tu base es de antes de esas funcionalidades,
-- esto también resuelve el error 500 al abrir "Mi Expediente".

CREATE TABLE IF NOT EXISTS encuestas_clima (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    empresa_id      BIGINT UNSIGNED NOT NULL,
    titulo          VARCHAR(150) NOT NULL,
    tipo            ENUM('felicidad','estres_burnout','liderazgo','clima_general') NOT NULL,
    anonima         TINYINT(1) NOT NULL DEFAULT 1,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    estado          ENUM('borrador','activa','cerrada') NOT NULL DEFAULT 'borrador',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_enc_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS encuesta_preguntas (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    encuesta_id     BIGINT UNSIGNED NOT NULL,
    texto           VARCHAR(500) NOT NULL,
    tipo            ENUM('escala_1_5','si_no','texto_libre') NOT NULL DEFAULT 'escala_1_5',
    orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_ep_encuesta FOREIGN KEY (encuesta_id) REFERENCES encuestas_clima(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS encuesta_respuestas (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    encuesta_id     BIGINT UNSIGNED NOT NULL,
    pregunta_id     BIGINT UNSIGNED NOT NULL,
    colaborador_id  BIGINT UNSIGNED NULL,
    valor           VARCHAR(500) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_er_encuesta FOREIGN KEY (encuesta_id) REFERENCES encuestas_clima(id) ON DELETE CASCADE,
    CONSTRAINT fk_er_pregunta FOREIGN KEY (pregunta_id) REFERENCES encuesta_preguntas(id) ON DELETE CASCADE,
    CONSTRAINT fk_er_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expediente_documentos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    colaborador_id  BIGINT UNSIGNED NOT NULL,
    tipo            ENUM('hoja_vida','certificado','contrato','soporte_sst','otro') NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    ruta_almacenamiento VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    tamano_bytes    INT UNSIGNED NOT NULL,
    hash_sha256     CHAR(64) NOT NULL,
    verificado      TINYINT(1) NOT NULL DEFAULT 0,
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    subido_por      BIGINT UNSIGNED NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ed_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    CONSTRAINT fk_ed_subido_por FOREIGN KEY (subido_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS objetivos_okr (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    colaborador_id  BIGINT UNSIGNED NOT NULL,
    descripcion     VARCHAR(255) NOT NULL,
    periodo         VARCHAR(20) NOT NULL,
    progreso_pct    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    estado          ENUM('activo','completado','cancelado') NOT NULL DEFAULT 'activo',
    CONSTRAINT fk_okr_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Nuevo en esta ronda: videos reales (YouTube) por curso.
CREATE TABLE IF NOT EXISTS curso_videos (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    curso_id            BIGINT UNSIGNED NOT NULL,
    titulo              VARCHAR(200) NOT NULL,
    url_youtube         VARCHAR(500) NOT NULL,
    orden               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    duracion_minutos    SMALLINT UNSIGNED NULL,
    activo              TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_cv_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Integración de Google Calendar/Meet (una sola cuenta a nivel de toda la
-- plataforma, conectada por un SUPER_ADMIN desde Admin > Integraciones).
CREATE TABLE IF NOT EXISTS google_integracion (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    refresh_token_cifrado   VARBINARY(2048) NOT NULL,
    cuenta_email            VARCHAR(255) NOT NULL,
    conectado_por           BIGINT UNSIGNED NOT NULL,
    conectado_en            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gi_usuario FOREIGN KEY (conectado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inscripcion_curso_videos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inscripcion_id  BIGINT UNSIGNED NOT NULL,
    curso_video_id  BIGINT UNSIGNED NOT NULL,
    visto_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inscripcion_video (inscripcion_id, curso_video_id),
    CONSTRAINT fk_icv_inscripcion FOREIGN KEY (inscripcion_id) REFERENCES inscripciones_cursos(id) ON DELETE CASCADE,
    CONSTRAINT fk_icv_video FOREIGN KEY (curso_video_id) REFERENCES curso_videos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
