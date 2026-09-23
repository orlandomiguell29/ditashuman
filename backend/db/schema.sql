-- ============================================================================
-- DITASH Human+ — Esquema de Base de Datos (MySQL 8.0+)
-- ============================================================================
-- Convenciones:
--   - InnoDB + utf8mb4 en todas las tablas (soporte emojis/acentos, transacciones, FKs)
--   - Claves primarias BIGINT UNSIGNED AUTO_INCREMENT
--   - Timestamps created_at/updated_at en todas las tablas de negocio
--   - Borrado lógico (deleted_at) donde aplica retención/legal (datos de RRHH y SST)
--   - Ninguna contraseña ni token se guarda en texto plano (ver capa de aplicación)
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS ditash CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE ditash;

-- ----------------------------------------------------------------------------
-- 1. SEGURIDAD: Roles, Permisos, Usuarios, Sesiones, Auditoría
-- ----------------------------------------------------------------------------

CREATE TABLE roles (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo          VARCHAR(40)  NOT NULL UNIQUE,      -- SUPER_ADMIN, ADMIN_EMPRESA, COLABORADOR, ESPECIALISTA
    nombre          VARCHAR(80)  NOT NULL,
    descripcion     VARCHAR(255) NULL,
    es_sistema      TINYINT(1)   NOT NULL DEFAULT 0,   -- roles base no editables/eliminables desde UI
    activo          TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE permisos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo          VARCHAR(80)  NOT NULL UNIQUE,      -- ej: usuarios.crear, citas.exportar
    modulo          VARCHAR(60)  NOT NULL,             -- ej: usuarios, citas, evaluaciones
    accion          VARCHAR(30)  NOT NULL,             -- crear, leer, actualizar, eliminar, exportar
    descripcion     VARCHAR(255) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE rol_permisos (
    rol_id          BIGINT UNSIGNED NOT NULL,
    permiso_id      BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT fk_rp_rol FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE empresas (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    nit             VARCHAR(30)  NOT NULL UNIQUE,
    plan            ENUM('basico','profesional','enterprise') NOT NULL DEFAULT 'basico',
    activo          TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME NULL
) ENGINE=InnoDB;

-- Usuarios: identidad única para colaborador, admin de empresa (RRHH) o especialista.
-- El "tipo" de perfil se resuelve por el rol + tablas de detalle (colaboradores/especialistas).
CREATE TABLE usuarios (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    empresa_id          BIGINT UNSIGNED NULL,          -- NULL para SUPER_ADMIN y especialistas independientes
    rol_id              BIGINT UNSIGNED NOT NULL,
    nombre              VARCHAR(150) NOT NULL,
    email               VARCHAR(190) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,         -- argon2id
    password_updated_at DATETIME NULL,
    cargo               VARCHAR(120) NULL,
    area                VARCHAR(120) NULL,
    telefono            VARCHAR(30)  NULL,
    estado              ENUM('activo','inactivo','bloqueado','pendiente_verificacion') NOT NULL DEFAULT 'pendiente_verificacion',
    mfa_habilitado      TINYINT(1)   NOT NULL DEFAULT 0,
    mfa_secret_cifrado  VARBINARY(255) NULL,           -- TOTP secret cifrado con AES (clave en KMS/env, nunca en claro)
    reset_password_token_hash CHAR(64) NULL,           -- SHA-256 del token de recuperación (el token en claro nunca se guarda)
    reset_password_expira     DATETIME NULL,
    intentos_fallidos   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    bloqueado_hasta     DATETIME NULL,
    ultimo_login_at     DATETIME NULL,
    ultimo_login_ip     VARCHAR(45) NULL,
    debe_cambiar_pass   TINYINT(1) NOT NULL DEFAULT 0,
    creado_por          BIGINT UNSIGNED NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME NULL,
    CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id),
    CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    INDEX idx_usuarios_empresa (empresa_id),
    INDEX idx_usuarios_estado (estado)
) ENGINE=InnoDB;

-- Refresh tokens de sesión (rotación + revocación). El access token JWT nunca se persiste.
CREATE TABLE refresh_tokens (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL,
    token_hash      CHAR(64) NOT NULL,                 -- SHA-256 del token (el token real solo vive en cookie httpOnly)
    familia_id      CHAR(36) NOT NULL,                 -- rotación: detecta reuso de tokens robados
    user_agent      VARCHAR(255) NULL,
    ip              VARCHAR(45) NULL,
    revocado        TINYINT(1) NOT NULL DEFAULT 0,
    expira_en       DATETIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rt_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_rt_usuario (usuario_id),
    INDEX idx_rt_hash (token_hash),
    INDEX idx_rt_familia (familia_id)
) ENGINE=InnoDB;

-- Auditoría: registro inmutable (solo INSERT desde la app) de acciones sensibles.
CREATE TABLE auditoria (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NULL,
    accion          VARCHAR(80)  NOT NULL,              -- login, login_fallido, crear_usuario, exportar_datos, etc.
    entidad         VARCHAR(60)  NULL,
    entidad_id      BIGINT UNSIGNED NULL,
    detalles        JSON NULL,
    ip              VARCHAR(45) NULL,
    user_agent      VARCHAR(255) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_aud_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_aud_usuario (usuario_id),
    INDEX idx_aud_accion (accion),
    INDEX idx_aud_fecha (created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. COLABORADOR (empleado / usuario final del bienestar corporativo)
-- ----------------------------------------------------------------------------

CREATE TABLE colaboradores (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL UNIQUE,
    empresa_id      BIGINT UNSIGNED NOT NULL,
    cargo           VARCHAR(120) NULL,
    area            VARCHAR(120) NULL,
    fecha_ingreso   DATE NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_colab_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_colab_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB;

CREATE TABLE categorias_bienestar (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo          VARCHAR(60) NOT NULL UNIQUE,
    titulo          VARCHAR(100) NOT NULL,
    icono           VARCHAR(60) NULL,
    orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    activo          TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE categoria_items (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    categoria_id    BIGINT UNSIGNED NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_ci_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_bienestar(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. ESPECIALISTA (marketplace de profesionales)
-- ----------------------------------------------------------------------------

CREATE TABLE especialistas (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL UNIQUE,
    categoria_id    BIGINT UNSIGNED NULL,
    especialidad    VARCHAR(120) NOT NULL,             -- ej: Psicóloga Clínica, Coach Ejecutivo
    tarifa_base     DECIMAL(12,2) NOT NULL,
    pct_comision    DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    bio             TEXT NULL,
    verificado      TINYINT(1) NOT NULL DEFAULT 0,
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_esp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_esp_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_bienestar(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE especialista_horarios (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    especialista_id BIGINT UNSIGNED NOT NULL,
    dia_semana      TINYINT UNSIGNED NOT NULL,          -- 0=domingo … 6=sábado
    hora_inicio     TIME NOT NULL,
    hora_fin        TIME NOT NULL,
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_eh_especialista FOREIGN KEY (especialista_id) REFERENCES especialistas(id) ON DELETE CASCADE,
    CONSTRAINT chk_horario CHECK (hora_fin > hora_inicio)
) ENGINE=InnoDB;

CREATE TABLE citas (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    colaborador_id      BIGINT UNSIGNED NOT NULL,
    especialista_id     BIGINT UNSIGNED NOT NULL,
    empresa_id          BIGINT UNSIGNED NOT NULL,
    categoria_id        BIGINT UNSIGNED NULL,
    fecha_hora          DATETIME NOT NULL,
    duracion_min        SMALLINT UNSIGNED NOT NULL DEFAULT 50,
    estado              ENUM('pendiente','confirmada','completada','cancelada','no_asistio') NOT NULL DEFAULT 'pendiente',
    canal               ENUM('videollamada_interna','zoom','teams','meet','presencial') NOT NULL DEFAULT 'videollamada_interna',
    enlace_reunion      VARCHAR(500) NULL,
    tarifa              DECIMAL(12,2) NOT NULL,
    cubre_empresa       DECIMAL(12,2) NOT NULL,
    paga_colaborador    DECIMAL(12,2) NOT NULL,
    motivo              VARCHAR(255) NULL,
    notas_privadas      TEXT NULL,                      -- solo visible para especialista/colaborador (dato sensible de salud)
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_citas_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
    CONSTRAINT fk_citas_esp FOREIGN KEY (especialista_id) REFERENCES especialistas(id),
    CONSTRAINT fk_citas_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    CONSTRAINT fk_citas_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_bienestar(id),
    INDEX idx_citas_fecha (fecha_hora),
    INDEX idx_citas_especialista (especialista_id, fecha_hora)
) ENGINE=InnoDB;

CREATE TABLE comisiones (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    especialista_id     BIGINT UNSIGNED NOT NULL,
    cita_id             BIGINT UNSIGNED NOT NULL UNIQUE,
    monto_bruto         DECIMAL(12,2) NOT NULL,
    pct_comision        DECIMAL(5,2) NOT NULL,
    monto_comision      DECIMAL(12,2) NOT NULL,
    monto_neto          DECIMAL(12,2) NOT NULL,
    periodo_liquidacion VARCHAR(20) NOT NULL,            -- ej: 2026-09-Q2 (quincena)
    estado              ENUM('pendiente','pagado','retenido') NOT NULL DEFAULT 'pendiente',
    fecha_pago          DATE NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_com_especialista FOREIGN KEY (especialista_id) REFERENCES especialistas(id),
    CONSTRAINT fk_com_cita FOREIGN KEY (cita_id) REFERENCES citas(id),
    INDEX idx_com_periodo (periodo_liquidacion)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. ACADEMIA VIRTUAL
-- ----------------------------------------------------------------------------

CREATE TABLE cursos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    titulo          VARCHAR(150) NOT NULL,
    descripcion     TEXT NULL,
    categoria_id    BIGINT UNSIGNED NULL,
    duracion_horas  DECIMAL(5,1) NOT NULL,
    videos_count    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    rating          DECIMAL(2,1) NULL,
    otorga_certificado TINYINT(1) NOT NULL DEFAULT 1,
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cursos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_bienestar(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Video real (YouTube) que compone un curso. El progreso ya no se basa en
-- el número decorativo `cursos.videos_count`, sino en cuántos de estos
-- videos concretos vio el colaborador (ver inscripcion_curso_videos).
CREATE TABLE curso_videos (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    curso_id            BIGINT UNSIGNED NOT NULL,
    titulo              VARCHAR(200) NOT NULL,
    url_youtube         VARCHAR(500) NOT NULL,
    orden               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    duracion_minutos    SMALLINT UNSIGNED NULL,
    activo              TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_cv_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE inscripciones_cursos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    colaborador_id  BIGINT UNSIGNED NOT NULL,
    curso_id        BIGINT UNSIGNED NOT NULL,
    progreso_pct    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    estado          ENUM('inscrito','en_progreso','completado') NOT NULL DEFAULT 'inscrito',
    fecha_inicio    DATETIME NULL,
    fecha_fin       DATETIME NULL,
    certificado_url VARCHAR(500) NULL,
    UNIQUE KEY uq_colab_curso (colaborador_id, curso_id),
    CONSTRAINT fk_ic_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    CONSTRAINT fk_ic_curso FOREIGN KEY (curso_id) REFERENCES cursos(id)
) ENGINE=InnoDB;

-- Qué video concreto de un curso ya vio cada inscripción (para calcular
-- progreso real, no simulado).
CREATE TABLE inscripcion_curso_videos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inscripcion_id  BIGINT UNSIGNED NOT NULL,
    curso_video_id  BIGINT UNSIGNED NOT NULL,
    visto_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inscripcion_video (inscripcion_id, curso_video_id),
    CONSTRAINT fk_icv_inscripcion FOREIGN KEY (inscripcion_id) REFERENCES inscripciones_cursos(id) ON DELETE CASCADE,
    CONSTRAINT fk_icv_video FOREIGN KEY (curso_video_id) REFERENCES curso_videos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. DESEMPEÑO: Competencias, Evaluaciones, PID
-- ----------------------------------------------------------------------------

CREATE TABLE competencias (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    descripcion     VARCHAR(255) NULL,
    activo          TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE tipos_evaluacion (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo          VARCHAR(20) NOT NULL UNIQUE,        -- 90, 180, 270, 360
    nombre          VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE evaluaciones (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    empresa_id          BIGINT UNSIGNED NOT NULL,
    colaborador_id      BIGINT UNSIGNED NOT NULL,
    evaluador_id        BIGINT UNSIGNED NULL,            -- usuario que evalúa (jefe, par, etc.)
    tipo_evaluacion_id  BIGINT UNSIGNED NOT NULL,
    periodo             VARCHAR(20) NOT NULL,            -- ej: 2026-S2
    estado              ENUM('abierta','en_progreso','cerrada') NOT NULL DEFAULT 'abierta',
    fecha_cierre        DATE NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ev_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    CONSTRAINT fk_ev_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
    CONSTRAINT fk_ev_evaluador FOREIGN KEY (evaluador_id) REFERENCES usuarios(id),
    CONSTRAINT fk_ev_tipo FOREIGN KEY (tipo_evaluacion_id) REFERENCES tipos_evaluacion(id)
) ENGINE=InnoDB;

CREATE TABLE evaluacion_competencias (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    evaluacion_id   BIGINT UNSIGNED NOT NULL,
    competencia_id  BIGINT UNSIGNED NOT NULL,
    puntaje         TINYINT UNSIGNED NOT NULL,           -- 1..5 (validado también en la API)
    comentario      VARCHAR(500) NULL,
    CONSTRAINT fk_ec_evaluacion FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_ec_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id),
    CONSTRAINT chk_puntaje CHECK (puntaje BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- Plan Individual de Desarrollo generado (manual o sugerido por reglas) tras la evaluación
CREATE TABLE planes_desarrollo (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    evaluacion_id   BIGINT UNSIGNED NOT NULL,
    colaborador_id  BIGINT UNSIGNED NOT NULL,
    gap_detectado   VARCHAR(255) NOT NULL,
    accion          ENUM('curso','interconsulta','reto') NOT NULL,
    curso_id        BIGINT UNSIGNED NULL,
    categoria_id    BIGINT UNSIGNED NULL,
    estado          ENUM('sugerido','en_progreso','completado') NOT NULL DEFAULT 'sugerido',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pid_eval FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_pid_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
    CONSTRAINT fk_pid_curso FOREIGN KEY (curso_id) REFERENCES cursos(id),
    CONSTRAINT fk_pid_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_bienestar(id)
) ENGINE=InnoDB;

CREATE TABLE objetivos_okr (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    colaborador_id  BIGINT UNSIGNED NOT NULL,
    descripcion     VARCHAR(255) NOT NULL,
    periodo         VARCHAR(20) NOT NULL,
    progreso_pct    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    estado          ENUM('activo','completado','cancelado') NOT NULL DEFAULT 'activo',
    CONSTRAINT fk_okr_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. CLIMA ORGANIZACIONAL Y ENCUESTAS (con soporte de anonimato real)
-- ----------------------------------------------------------------------------

CREATE TABLE encuestas_clima (
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

CREATE TABLE encuesta_preguntas (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    encuesta_id     BIGINT UNSIGNED NOT NULL,
    texto           VARCHAR(500) NOT NULL,
    tipo            ENUM('escala_1_5','si_no','texto_libre') NOT NULL DEFAULT 'escala_1_5',
    orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_ep_encuesta FOREIGN KEY (encuesta_id) REFERENCES encuestas_clima(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Si la encuesta es anónima, colaborador_id se guarda NULL desde la app (nunca se persiste el vínculo),
-- garantizando anonimato real a nivel de dato y no solo de interfaz.
CREATE TABLE encuesta_respuestas (
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

-- ----------------------------------------------------------------------------
-- 7. EXPEDIENTE DIGITAL (documentos sensibles del colaborador)
-- ----------------------------------------------------------------------------

CREATE TABLE expediente_documentos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    colaborador_id  BIGINT UNSIGNED NOT NULL,
    tipo            ENUM('hoja_vida','certificado','contrato','soporte_sst','otro') NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    ruta_almacenamiento VARCHAR(500) NOT NULL,          -- ruta en storage privado (S3/MinIO), nunca pública
    mime_type       VARCHAR(100) NOT NULL,
    tamano_bytes    INT UNSIGNED NOT NULL,
    hash_sha256     CHAR(64) NOT NULL,                  -- integridad del archivo
    verificado      TINYINT(1) NOT NULL DEFAULT 0,
    activo          TINYINT(1) NOT NULL DEFAULT 1,        -- "eliminar" un documento solo lo inactiva (ver crudFactory.js)
    subido_por      BIGINT UNSIGNED NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ed_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    CONSTRAINT fk_ed_subido_por FOREIGN KEY (subido_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. NOTIFICACIONES
-- ----------------------------------------------------------------------------

CREATE TABLE notificaciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL,
    tipo            VARCHAR(50) NOT NULL,
    mensaje         VARCHAR(500) NOT NULL,
    leida           TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_notif_usuario_leida (usuario_id, leida)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8b. INTEGRACIÓN GOOGLE CALENDAR/MEET
-- ----------------------------------------------------------------------------

-- Una sola cuenta de Google conectada a nivel de toda la plataforma (no por
-- especialista), usada para generar enlaces reales de Google Meet al
-- agendar citas. El refresh token se guarda cifrado (AES-256-GCM).
CREATE TABLE google_integracion (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    refresh_token_cifrado   VARBINARY(2048) NOT NULL,
    cuenta_email            VARCHAR(255) NOT NULL,
    conectado_por           BIGINT UNSIGNED NOT NULL,
    conectado_en            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gi_usuario FOREIGN KEY (conectado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. VISTA: Indicadores agregados para el Dashboard RRHH (evita exponer PII cruda)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_indicadores_empresa AS
SELECT
    e.id AS empresa_id,
    e.nombre AS empresa,
    COALESCE(SUM(ic.progreso_pct >= 100) , 0) AS cursos_completados,
    COALESCE(ROUND(AVG(NULLIF(ic.progreso_pct,0)),1), 0) AS progreso_promedio_cursos,
    (SELECT COUNT(*) FROM citas c WHERE c.empresa_id = e.id AND c.estado = 'completada') AS asesorias_completadas
FROM empresas e
LEFT JOIN colaboradores col ON col.empresa_id = e.id
LEFT JOIN inscripciones_cursos ic ON ic.colaborador_id = col.id
GROUP BY e.id, e.nombre;
