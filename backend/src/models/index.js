const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// -----------------------------------------------------------------------------
// Definición de modelos Sequelize mapeando 1:1 el esquema de db/schema.sql.
// Se usan exclusivamente queries parametrizadas (vía Sequelize) — nunca se
// concatenan strings SQL con entrada de usuario en ningún controlador.
// -----------------------------------------------------------------------------

const Rol = sequelize.define('Rol', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(40), unique: true, allowNull: false },
  nombre: { type: DataTypes.STRING(80), allowNull: false },
  descripcion: DataTypes.STRING(255),
  es_sistema: { type: DataTypes.BOOLEAN, defaultValue: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'roles' });

const Permiso = sequelize.define('Permiso', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(80), unique: true, allowNull: false },
  modulo: { type: DataTypes.STRING(60), allowNull: false },
  accion: { type: DataTypes.STRING(30), allowNull: false },
  descripcion: DataTypes.STRING(255),
}, { tableName: 'permisos', updatedAt: false });

const Empresa = sequelize.define('Empresa', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(150), allowNull: false },
  nit: { type: DataTypes.STRING(30), unique: true, allowNull: false },
  plan: { type: DataTypes.ENUM('basico', 'profesional', 'enterprise'), defaultValue: 'basico' },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'empresas', paranoid: true, deletedAt: 'deleted_at' });

const Usuario = sequelize.define('Usuario', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  empresa_id: DataTypes.BIGINT.UNSIGNED,
  rol_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  nombre: { type: DataTypes.STRING(150), allowNull: false },
  email: { type: DataTypes.STRING(190), unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  password_updated_at: DataTypes.DATE,
  cargo: DataTypes.STRING(120),
  area: DataTypes.STRING(120),
  telefono: DataTypes.STRING(30),
  estado: {
    type: DataTypes.ENUM('activo', 'inactivo', 'bloqueado', 'pendiente_verificacion'),
    defaultValue: 'pendiente_verificacion',
  },
  mfa_habilitado: { type: DataTypes.BOOLEAN, defaultValue: false },
  mfa_secret_cifrado: DataTypes.BLOB,
  reset_password_token_hash: DataTypes.CHAR(64), // SHA-256 del token de recuperación; el token en claro nunca se persiste
  reset_password_expira: DataTypes.DATE,
  intentos_fallidos: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  bloqueado_hasta: DataTypes.DATE,
  ultimo_login_at: DataTypes.DATE,
  ultimo_login_ip: DataTypes.STRING(45),
  debe_cambiar_pass: { type: DataTypes.BOOLEAN, defaultValue: false },
  creado_por: DataTypes.BIGINT.UNSIGNED,
}, {
  tableName: 'usuarios',
  paranoid: true,
  deletedAt: 'deleted_at',
  defaultScope: { attributes: { exclude: ['password_hash', 'mfa_secret_cifrado', 'reset_password_token_hash'] } },
  scopes: { conAuth: { attributes: {} } },
});

const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false },
  familia_id: { type: DataTypes.CHAR(36), allowNull: false },
  user_agent: DataTypes.STRING(255),
  ip: DataTypes.STRING(45),
  revocado: { type: DataTypes.BOOLEAN, defaultValue: false },
  expira_en: { type: DataTypes.DATE, allowNull: false },
}, { tableName: 'refresh_tokens', updatedAt: false });

const Auditoria = sequelize.define('Auditoria', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: DataTypes.BIGINT.UNSIGNED,
  accion: { type: DataTypes.STRING(80), allowNull: false },
  entidad: DataTypes.STRING(60),
  entidad_id: DataTypes.BIGINT.UNSIGNED,
  detalles: DataTypes.JSON,
  ip: DataTypes.STRING(45),
  user_agent: DataTypes.STRING(255),
}, { tableName: 'auditoria', updatedAt: false });

const Colaborador = sequelize.define('Colaborador', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
  empresa_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  cargo: DataTypes.STRING(120),
  area: DataTypes.STRING(120),
  fecha_ingreso: DataTypes.DATEONLY,
}, { tableName: 'colaboradores' });

const CategoriaBienestar = sequelize.define('CategoriaBienestar', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(60), unique: true, allowNull: false },
  titulo: { type: DataTypes.STRING(100), allowNull: false },
  icono: DataTypes.STRING(60),
  orden: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'categorias_bienestar', timestamps: false });

const CategoriaItem = sequelize.define('CategoriaItem', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  categoria_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  orden: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
}, { tableName: 'categoria_items', timestamps: false });

const Especialista = sequelize.define('Especialista', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
  categoria_id: DataTypes.BIGINT.UNSIGNED,
  especialidad: { type: DataTypes.STRING(120), allowNull: false },
  tarifa_base: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  pct_comision: { type: DataTypes.DECIMAL(5, 2), defaultValue: 15.0 },
  // Duración estándar (en minutos) de las citas de este especialista:
  // parametriza el tamaño de los "slots" que ve el colaborador al agendar
  // (colaboradorController.horariosDisponibles), la ventana en la que el
  // enlace de videollamada queda activo, y la duración que se copia a cada
  // Cita al crearse (Cita.duracion_min). Antes era un valor fijo de 60
  // minutos igual para todos los especialistas.
  duracion_minutos: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 60 },
  bio: DataTypes.TEXT,
  verificado: { type: DataTypes.BOOLEAN, defaultValue: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'especialistas' });

const EspecialistaHorario = sequelize.define('EspecialistaHorario', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  especialista_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  dia_semana: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
  hora_inicio: { type: DataTypes.TIME, allowNull: false },
  hora_fin: { type: DataTypes.TIME, allowNull: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'especialista_horarios', timestamps: false });

const Cita = sequelize.define('Cita', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  colaborador_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  especialista_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  empresa_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  categoria_id: DataTypes.BIGINT.UNSIGNED,
  fecha_hora: { type: DataTypes.DATE, allowNull: false },
  duracion_min: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 50 },
  estado: {
    type: DataTypes.ENUM('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'),
    defaultValue: 'pendiente',
  },
  canal: {
    type: DataTypes.ENUM('videollamada_interna', 'zoom', 'teams', 'meet', 'presencial'),
    defaultValue: 'videollamada_interna',
  },
  enlace_reunion: DataTypes.STRING(500),
  tarifa: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  cubre_empresa: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  paga_colaborador: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  motivo: DataTypes.STRING(255),
  notas_privadas: DataTypes.TEXT,
}, { tableName: 'citas' });

const Comision = sequelize.define('Comision', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  especialista_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  cita_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
  monto_bruto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  pct_comision: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  monto_comision: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  monto_neto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  periodo_liquidacion: { type: DataTypes.STRING(20), allowNull: false },
  estado: { type: DataTypes.ENUM('pendiente', 'pagado', 'retenido'), defaultValue: 'pendiente' },
  fecha_pago: DataTypes.DATEONLY,
}, { tableName: 'comisiones', updatedAt: false });

const Curso = sequelize.define('Curso', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  titulo: { type: DataTypes.STRING(150), allowNull: false },
  descripcion: DataTypes.TEXT,
  categoria_id: DataTypes.BIGINT.UNSIGNED,
  duracion_horas: { type: DataTypes.DECIMAL(5, 1), allowNull: false },
  videos_count: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  rating: DataTypes.DECIMAL(2, 1),
  otorga_certificado: { type: DataTypes.BOOLEAN, defaultValue: true },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  // Parametrizable por curso desde Admin > Cursos: cuántas veces puede
  // intentar un colaborador la evaluación final antes de quedar bloqueado.
  // Antes era un número fijo en el código (2) igual para todos los cursos.
  max_intentos_evaluacion: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 2 },
}, { tableName: 'cursos', updatedAt: false });

// Video real (enlace de YouTube) que compone un curso. El progreso del
// colaborador se calcula sobre la cantidad de videos que existan aquí, no
// sobre el campo estático `videos_count` de Curso (que era solo un número
// decorativo sin contenido real detrás — de ahí que "avanzara por dar clic"
// sin haber nada que ver).
const CursoVideo = sequelize.define('CursoVideo', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  curso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  titulo: { type: DataTypes.STRING(200), allowNull: false },
  url_youtube: { type: DataTypes.STRING(500), allowNull: false },
  orden: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  duracion_minutos: DataTypes.SMALLINT.UNSIGNED,
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'curso_videos', timestamps: false });

const InscripcionCurso = sequelize.define('InscripcionCurso', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  colaborador_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  curso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  progreso_pct: { type: DataTypes.TINYINT.UNSIGNED, defaultValue: 0 },
  estado: { type: DataTypes.ENUM('inscrito', 'en_progreso', 'completado'), defaultValue: 'inscrito' },
  fecha_inicio: DataTypes.DATE,
  fecha_fin: DataTypes.DATE,
  certificado_url: DataTypes.STRING(500),
  // El certificado ya NO se activa solo por ver todos los videos: hace
  // falta además aprobar la evaluación final (ver CursoPregunta más abajo).
  // `quiz_mejor_puntaje` guarda el mejor % logrado en los intentos (se
  // permite reintentar), y `quiz_aprobado` es la bandera real que, junto
  // con "todos los videos vistos", habilita el certificado.
  quiz_intentos: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  quiz_mejor_puntaje: { type: DataTypes.TINYINT.UNSIGNED, defaultValue: 0 },
  quiz_aprobado: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'inscripciones_cursos', timestamps: false });

// Evaluación final de opción múltiple del curso: es lo que hace que el
// certificado no dependa solo de "haber dado play" a los videos. Se exige
// un puntaje mínimo (ver PUNTAJE_MINIMO_QUIZ en colaboradorController) para
// que la inscripción quede realmente `completado` con certificado.
// `opciones` es un array JSON de 2 a 5 textos; `respuesta_correcta` es el
// índice (0-based) de la opción correcta dentro de ese array — nunca se
// envía al frontend antes de calificar (ver colaboradorController.academia,
// que excluye ese campo al listar).
const CursoPregunta = sequelize.define('CursoPregunta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  curso_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  texto: { type: DataTypes.STRING(500), allowNull: false },
  opciones: { type: DataTypes.JSON, allowNull: false },
  respuesta_correcta: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
  orden: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'curso_preguntas', timestamps: false });

// Registra exactamente qué video de un curso ya vio una inscripción
// concreta. Con esto el progreso ya no es "clics abstractos" sino un
// conteo real de videos vistos vs. videos totales del curso.
const InscripcionCursoVideo = sequelize.define('InscripcionCursoVideo', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  inscripcion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  curso_video_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  visto_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'inscripcion_curso_videos', timestamps: false });

const Competencia = sequelize.define('Competencia', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  descripcion: DataTypes.STRING(255),
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'competencias', timestamps: false });

const TipoEvaluacion = sequelize.define('TipoEvaluacion', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  nombre: { type: DataTypes.STRING(60), allowNull: false },
}, { tableName: 'tipos_evaluacion', timestamps: false });

// `estado` de una evaluación con preguntas (ver EvaluacionPregunta/
// EvaluacionRespuesta más abajo):
//   'abierta'     -> el colaborador todavía no ha respondido.
//   'en_progreso' -> el colaborador ya respondió, pero la evaluación tiene
//                    preguntas de texto libre y el evaluador aún no las
//                    califica manualmente. La nota NO es visible para el
//                    colaborador en este estado.
//   'cerrada'     -> calificación completa (automática si no había texto
//                    libre, o ya calificada a mano) y `nota_final` visible.
// Una evaluación creada solo con competencias (flujo original, sin
// preguntas) sigue naciendo directamente en 'cerrada', sin pasar por aquí.
const Evaluacion = sequelize.define('Evaluacion', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  empresa_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  colaborador_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  evaluador_id: DataTypes.BIGINT.UNSIGNED,
  tipo_evaluacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  periodo: { type: DataTypes.STRING(20), allowNull: false },
  estado: { type: DataTypes.ENUM('abierta', 'en_progreso', 'cerrada'), defaultValue: 'abierta' },
  fecha_cierre: DataTypes.DATEONLY,
  respondida_en: DataTypes.DATE,
  // Suma de puntos de las preguntas objetivas (sí/no y numéricas) ya
  // calificadas automáticamente al responder. Se guarda siempre (aunque la
  // evaluación tenga preguntas de texto libre pendientes) pero el backend
  // NUNCA lo expone al colaborador mientras `estado !== 'cerrada'` — así no
  // hay forma de "adivinar" la nota parcial inspeccionando la respuesta de
  // la API.
  nota_parcial: DataTypes.DECIMAL(6, 2),
  // Nota definitiva (parcial + puntos de texto libre ya calificados a
  // mano). Solo se llena cuando `estado === 'cerrada'`; es la única de las
  // dos que el colaborador puede ver.
  nota_final: DataTypes.DECIMAL(6, 2),
  // Suma de `puntos` de todas las preguntas configuradas (snapshot), para
  // poder mostrar "12/15" además del porcentaje sin tener que recontar.
  puntos_totales: DataTypes.DECIMAL(6, 2),
  // true si la evaluación tiene al menos una pregunta de texto libre — se
  // calcula una sola vez al crearla y se guarda, en vez de recalcularlo en
  // cada lectura, para que el frontend sepa de entrada si debe esperar
  // calificación manual.
  requiere_calificacion_manual: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'evaluaciones', updatedAt: false });

// Pregunta de una evaluación de desempeño tipo cuestionario (distinta de
// EvaluacionCompetencia, que es la calificación directa 1-5 que hace el
// evaluador). 'si_no' y 'numerica' se autocalifican comparando contra la
// respuesta correcta que el evaluador marca al crear la pregunta;
// 'texto_libre' siempre requiere calificación manual (no tiene respuesta
// correcta posible).
const EvaluacionPregunta = sequelize.define('EvaluacionPregunta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  evaluacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  tipo: { type: DataTypes.ENUM('si_no', 'numerica', 'texto_libre'), allowNull: false },
  texto: { type: DataTypes.STRING(500), allowNull: false },
  orden: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
  puntos: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 1 },
  respuesta_correcta_si_no: DataTypes.BOOLEAN,
  respuesta_correcta_numerica: DataTypes.DECIMAL(10, 2),
}, { tableName: 'evaluacion_preguntas', timestamps: false });

// Respuesta del colaborador a una EvaluacionPregunta. `calificada` queda en
// true de inmediato para sí/no y numérica (autocalificadas al responder) y
// en false para texto_libre hasta que el evaluador la califica desde el
// panel de RRHH (ver empresaController.calificarRespuestasEvaluacion).
const EvaluacionRespuesta = sequelize.define('EvaluacionRespuesta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  evaluacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  pregunta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  valor_si_no: DataTypes.BOOLEAN,
  valor_numerico: DataTypes.DECIMAL(10, 2),
  valor_texto: DataTypes.TEXT,
  es_correcta: DataTypes.BOOLEAN, // null para texto_libre (no aplica "correcto/incorrecto")
  puntos_obtenidos: DataTypes.DECIMAL(5, 2), // null en texto_libre hasta que se califica a mano
  calificada: { type: DataTypes.BOOLEAN, defaultValue: false },
  comentario_evaluador: DataTypes.STRING(500),
}, { tableName: 'evaluacion_respuestas', updatedAt: false });

const EvaluacionCompetencia = sequelize.define('EvaluacionCompetencia', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  evaluacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  competencia_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  puntaje: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, validate: { min: 1, max: 5 } },
  comentario: DataTypes.STRING(500),
}, { tableName: 'evaluacion_competencias', timestamps: false });

const PlanDesarrollo = sequelize.define('PlanDesarrollo', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  evaluacion_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  colaborador_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  gap_detectado: { type: DataTypes.STRING(255), allowNull: false },
  accion: { type: DataTypes.ENUM('curso', 'interconsulta', 'reto'), allowNull: false },
  curso_id: DataTypes.BIGINT.UNSIGNED,
  categoria_id: DataTypes.BIGINT.UNSIGNED,
  estado: { type: DataTypes.ENUM('sugerido', 'en_progreso', 'completado'), defaultValue: 'sugerido' },
}, { tableName: 'planes_desarrollo', updatedAt: false });

const ObjetivoOkr = sequelize.define('ObjetivoOkr', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  colaborador_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  descripcion: { type: DataTypes.STRING(255), allowNull: false },
  periodo: { type: DataTypes.STRING(20), allowNull: false },
  progreso_pct: { type: DataTypes.TINYINT.UNSIGNED, defaultValue: 0 },
  estado: { type: DataTypes.ENUM('activo', 'completado', 'cancelado'), defaultValue: 'activo' },
}, { tableName: 'objetivos_okr', timestamps: false });

const EncuestaClima = sequelize.define('EncuestaClima', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  empresa_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  titulo: { type: DataTypes.STRING(150), allowNull: false },
  tipo: { type: DataTypes.ENUM('felicidad', 'estres_burnout', 'liderazgo', 'clima_general'), allowNull: false },
  anonima: { type: DataTypes.BOOLEAN, defaultValue: true },
  fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
  fecha_fin: { type: DataTypes.DATEONLY, allowNull: false },
  estado: { type: DataTypes.ENUM('borrador', 'activa', 'cerrada'), defaultValue: 'borrador' },
}, { tableName: 'encuestas_clima', updatedAt: false });

const EncuestaPregunta = sequelize.define('EncuestaPregunta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  encuesta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  texto: { type: DataTypes.STRING(500), allowNull: false },
  tipo: { type: DataTypes.ENUM('escala_1_5', 'si_no', 'texto_libre'), defaultValue: 'escala_1_5' },
  orden: { type: DataTypes.SMALLINT.UNSIGNED, defaultValue: 0 },
}, { tableName: 'encuesta_preguntas', timestamps: false });

const EncuestaRespuesta = sequelize.define('EncuestaRespuesta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  encuesta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  pregunta_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  colaborador_id: DataTypes.BIGINT.UNSIGNED, // NULL si la encuesta es anónima
  valor: { type: DataTypes.STRING(500), allowNull: false },
}, { tableName: 'encuesta_respuestas', updatedAt: false });

const ExpedienteDocumento = sequelize.define('ExpedienteDocumento', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  colaborador_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  tipo: { type: DataTypes.ENUM('hoja_vida', 'certificado', 'contrato', 'soporte_sst', 'otro'), allowNull: false },
  nombre_original: { type: DataTypes.STRING(255), allowNull: false },
  ruta_almacenamiento: { type: DataTypes.STRING(500), allowNull: false },
  mime_type: { type: DataTypes.STRING(100), allowNull: false },
  tamano_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  hash_sha256: { type: DataTypes.CHAR(64), allowNull: false },
  verificado: { type: DataTypes.BOOLEAN, defaultValue: false },
  activo: { type: DataTypes.BOOLEAN, defaultValue: true },
  subido_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
}, { tableName: 'expediente_documentos', updatedAt: false });

const Notificacion = sequelize.define('Notificacion', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  tipo: { type: DataTypes.STRING(50), allowNull: false },
  mensaje: { type: DataTypes.STRING(500), allowNull: false },
  leida: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'notificaciones', updatedAt: false });

// --- Asociaciones ---
Rol.belongsToMany(Permiso, { through: 'rol_permisos', foreignKey: 'rol_id', otherKey: 'permiso_id', timestamps: false });
Permiso.belongsToMany(Rol, { through: 'rol_permisos', foreignKey: 'permiso_id', otherKey: 'rol_id', timestamps: false });

Usuario.belongsTo(Rol, { foreignKey: 'rol_id' });
Usuario.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Usuario.hasMany(RefreshToken, { foreignKey: 'usuario_id' });
RefreshToken.belongsTo(Usuario, { foreignKey: 'usuario_id' });

Empresa.hasMany(Colaborador, { foreignKey: 'empresa_id' });
Colaborador.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Colaborador.belongsTo(Usuario, { foreignKey: 'usuario_id' });
Usuario.hasOne(Colaborador, { foreignKey: 'usuario_id' });

Especialista.belongsTo(Usuario, { foreignKey: 'usuario_id' });
Especialista.belongsTo(CategoriaBienestar, { foreignKey: 'categoria_id' });
Especialista.hasMany(EspecialistaHorario, { foreignKey: 'especialista_id' });
EspecialistaHorario.belongsTo(Especialista, { foreignKey: 'especialista_id' });

CategoriaBienestar.hasMany(CategoriaItem, { foreignKey: 'categoria_id' });
CategoriaItem.belongsTo(CategoriaBienestar, { foreignKey: 'categoria_id' });

Cita.belongsTo(Colaborador, { foreignKey: 'colaborador_id' });
Cita.belongsTo(Especialista, { foreignKey: 'especialista_id' });
Cita.belongsTo(Empresa, { foreignKey: 'empresa_id' });
Cita.belongsTo(CategoriaBienestar, { foreignKey: 'categoria_id' });
Cita.hasOne(Comision, { foreignKey: 'cita_id' });
Comision.belongsTo(Cita, { foreignKey: 'cita_id' });
Comision.belongsTo(Especialista, { foreignKey: 'especialista_id' });

Curso.belongsTo(CategoriaBienestar, { foreignKey: 'categoria_id' });
Curso.hasMany(CursoVideo, { foreignKey: 'curso_id' });
CursoVideo.belongsTo(Curso, { foreignKey: 'curso_id' });
Curso.hasMany(CursoPregunta, { foreignKey: 'curso_id' });
CursoPregunta.belongsTo(Curso, { foreignKey: 'curso_id' });
InscripcionCurso.belongsTo(Colaborador, { foreignKey: 'colaborador_id' });
InscripcionCurso.belongsTo(Curso, { foreignKey: 'curso_id' });
InscripcionCurso.hasMany(InscripcionCursoVideo, { foreignKey: 'inscripcion_id' });
InscripcionCursoVideo.belongsTo(InscripcionCurso, { foreignKey: 'inscripcion_id' });
InscripcionCursoVideo.belongsTo(CursoVideo, { foreignKey: 'curso_video_id' });

Evaluacion.belongsTo(Colaborador, { foreignKey: 'colaborador_id' });
Evaluacion.belongsTo(TipoEvaluacion, { foreignKey: 'tipo_evaluacion_id' });
Evaluacion.hasMany(EvaluacionCompetencia, { foreignKey: 'evaluacion_id' });
EvaluacionCompetencia.belongsTo(Competencia, { foreignKey: 'competencia_id' });
Evaluacion.hasMany(PlanDesarrollo, { foreignKey: 'evaluacion_id' });
// Sin `include` para EvaluacionPregunta/EvaluacionRespuesta en los
// controladores: el mismo bug de Sequelize que dejaba "0 preguntas" en las
// encuestas de clima (ver empresaController.preguntasPorEncuesta) aplica
// aquí igual — ambas tablas tienen columna `id` y un `order` en el padre
// puede resolver mal el JOIN. Las asociaciones quedan declaradas solo para
// que `belongsTo`/`hasMany` sirvan de documentación del esquema; las
// lecturas reales siempre son queries separadas + agrupación en JS.
Evaluacion.hasMany(EvaluacionPregunta, { foreignKey: 'evaluacion_id' });
Evaluacion.hasMany(EvaluacionRespuesta, { foreignKey: 'evaluacion_id' });
EvaluacionRespuesta.belongsTo(EvaluacionPregunta, { foreignKey: 'pregunta_id' });
PlanDesarrollo.belongsTo(Colaborador, { foreignKey: 'colaborador_id' });
// RRHH puede asignar un curso concreto del catálogo como la "acción
// sugerida" del plan de desarrollo (antes `accion` era siempre el texto fijo
// "curso" sin ningún curso real detrás — ver empresaController.actualizarPid).
PlanDesarrollo.belongsTo(Curso, { foreignKey: 'curso_id' });

ObjetivoOkr.belongsTo(Colaborador, { foreignKey: 'colaborador_id' });

EncuestaClima.hasMany(EncuestaPregunta, { foreignKey: 'encuesta_id' });
EncuestaPregunta.belongsTo(EncuestaClima, { foreignKey: 'encuesta_id' });
EncuestaRespuesta.belongsTo(EncuestaPregunta, { foreignKey: 'pregunta_id' });

ExpedienteDocumento.belongsTo(Colaborador, { foreignKey: 'colaborador_id' });

// Guarda UNA integración de Google Calendar/Meet a nivel de toda la
// plataforma (no por especialista): el refresh token de la cuenta de
// Google conectada por un SUPER_ADMIN desde Admin > Integraciones. Se
// espera una sola fila; el refresh token se guarda cifrado (AES-256-GCM,
// misma utilidad que el secreto TOTP de MFA), nunca en texto plano.
const GoogleIntegracion = sequelize.define('GoogleIntegracion', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  refresh_token_cifrado: { type: DataTypes.BLOB, allowNull: false },
  cuenta_email: { type: DataTypes.STRING(255), allowNull: false },
  conectado_por: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  conectado_en: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'google_integracion', timestamps: false });

module.exports = {
  sequelize,
  Rol,
  Permiso,
  Empresa,
  Usuario,
  RefreshToken,
  Auditoria,
  Colaborador,
  CategoriaBienestar,
  CategoriaItem,
  Especialista,
  EspecialistaHorario,
  Cita,
  Comision,
  Curso,
  CursoVideo,
  CursoPregunta,
  InscripcionCurso,
  InscripcionCursoVideo,
  Competencia,
  TipoEvaluacion,
  Evaluacion,
  EvaluacionCompetencia,
  EvaluacionPregunta,
  EvaluacionRespuesta,
  PlanDesarrollo,
  ObjetivoOkr,
  EncuestaClima,
  EncuestaPregunta,
  EncuestaRespuesta,
  ExpedienteDocumento,
  Notificacion,
  GoogleIntegracion,
};
