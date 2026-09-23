/* eslint-disable no-console */
// Script de siembra inicial: crea roles de sistema, el catálogo completo de
// permisos, una empresa demo, un usuario por cada rol y los catálogos base
// (categorías de bienestar, cursos, competencias, tipos de evaluación).
// Ejecutar con: npm run seed  (requiere que db/schema.sql ya esté aplicado).
require('dotenv').config();
const { catalogoCompleto } = require('../src/config/permisos');
const { hashPassword } = require('../src/utils/password');
const {
  sequelize,
  Rol,
  Permiso,
  Empresa,
  Usuario,
  Colaborador,
  Especialista,
  EspecialistaHorario,
  CategoriaBienestar,
  CategoriaItem,
  Curso,
  CursoVideo,
  CursoPregunta,
  Competencia,
  TipoEvaluacion,
  EncuestaClima,
  EncuestaPregunta,
} = require('../src/models');

const PASSWORD_DEMO = 'Ditash#2026!'; // Cumple la política; DEBE cambiarse tras el primer login.

async function seedRolesYPermisos() {
  const permisos = catalogoCompleto();
  await Permiso.bulkCreate(permisos, { ignoreDuplicates: true });
  const permisosDb = await Permiso.findAll();

  const [superAdmin] = await Rol.findOrCreate({
    where: { codigo: 'SUPER_ADMIN' },
    defaults: { nombre: 'Super Administrador', descripcion: 'Acceso total a la plataforma (todas las empresas).', es_sistema: true },
  });
  const [adminEmpresa] = await Rol.findOrCreate({
    where: { codigo: 'ADMIN_EMPRESA' },
    defaults: { nombre: 'Administrador RRHH', descripcion: 'Gestiona su empresa: colaboradores, desempeño y clima.', es_sistema: true },
  });
  const [colaborador] = await Rol.findOrCreate({
    where: { codigo: 'COLABORADOR' },
    defaults: { nombre: 'Colaborador', descripcion: 'Usuario final del bienestar corporativo.', es_sistema: true },
  });
  const [especialista] = await Rol.findOrCreate({
    where: { codigo: 'ESPECIALISTA' },
    defaults: { nombre: 'Especialista', descripcion: 'Profesional del marketplace de bienestar.', es_sistema: true },
  });

  // SUPER_ADMIN: bypass total en el middleware RBAC, pero igual se le asignan
  // todos los permisos para que listados/exportaciones del catálogo sean coherentes.
  await superAdmin.setPermisos(permisosDb);

  const cod = (m, a) => `${m}.${a}`;
  const porModulo = (modulos, acciones) =>
    permisosDb.filter((p) => modulos.includes(p.modulo) && acciones.includes(p.accion)).map((p) => p.id);

  // ADMIN_EMPRESA (RRHH de una empresa cliente) administra TODO lo que
  // ocurre dentro de su propia empresa: sus usuarios/colaboradores, el
  // catálogo de contenidos que consumen (cursos, categorías, competencias),
  // desempeño y clima, y puede crear roles a la medida de su organización
  // (ej. "Supervisor SST") reutilizando el catálogo fijo de permisos.
  await adminEmpresa.setPermisos([
    ...porModulo(
      ['usuarios', 'colaboradores', 'citas', 'cursos', 'evaluaciones', 'okrs', 'clima', 'expedientes', 'categorias', 'roles'],
      ['crear', 'leer', 'actualizar', 'inactivar', 'exportar']
    ),
    // Los especialistas son un marketplace GLOBAL, no de una empresa
    // particular: RRHH solo puede consultarlos para agendar, nunca darlos
    // de alta, editarlos ni desactivarlos (eso es exclusivo de SUPER_ADMIN).
    ...porModulo(['especialistas'], ['leer']),
    // Las comisiones son la liquidación de pagos del marketplace GLOBAL a
    // sus especialistas: es una operación financiera de plataforma, nunca
    // de una empresa cliente en particular (ver comisionesController.js,
    // que además exige SUPER_ADMIN explícitamente). RRHH no recibe ningún
    // permiso sobre este módulo.
    // Necesita leer el catálogo de permisos para armar el checklist al
    // crear/editar un rol, pero no puede alterar el catálogo en sí.
    ...porModulo(['permisos'], ['leer', 'exportar']),
    ...porModulo(['auditoria'], ['leer', 'exportar']),
  ]);

  await colaborador.setPermisos(porModulo(['colaboradores', 'citas', 'cursos', 'expedientes'], ['leer', 'crear']));

  await especialista.setPermisos(porModulo(['especialistas', 'citas', 'comisiones'], ['leer', 'actualizar', 'exportar']));

  return { superAdmin, adminEmpresa, colaborador, especialista };
}

async function seedCatalogos() {
  const categoriasSeed = [
    { codigo: 'bienestar_emocional', titulo: 'Bienestar Emocional', icono: 'fa-heart-pulse', items: ['Psicólogos', 'Terapias', 'Ansiedad', 'Estrés', 'Depresión', 'Burnout'] },
    { codigo: 'bienestar', titulo: 'Bienestar', icono: 'fa-spa', items: ['Yoga', 'Meditación', 'Fisiopilates', 'Nutrición', 'Hábitos Saludables'] },
    { codigo: 'coaching', titulo: 'Coaching', icono: 'fa-lightbulb', items: ['Coaching Ejecutivo', 'Coaching de Vida', 'Coaching Financiero', 'Coaching Profesional'] },
    { codigo: 'imagen', titulo: 'Imagen Personal', icono: 'fa-user-tie', items: ['Asesoría de Imagen', 'Marca Personal', 'Protocolo Empresarial', 'Comunicación Ejecutiva'] },
    { codigo: 'desarrollo', titulo: 'Desarrollo Profesional', icono: 'fa-briefcase', items: ['Hoja de Vida', 'LinkedIn', 'Entrevistas', 'Empleabilidad', 'Liderazgo'] },
    { codigo: 'sst', titulo: 'SST', icono: 'fa-shield-halved', items: ['Riesgo Psicosocial', 'Ergonomía', 'Salud Ocupacional', 'Evidencias', 'Reporte de incidentes'] },
  ];

  const categoriasCreadas = {};
  for (const [i, cat] of categoriasSeed.entries()) {
    const [creada] = await CategoriaBienestar.findOrCreate({
      where: { codigo: cat.codigo },
      defaults: { titulo: cat.titulo, icono: cat.icono, orden: i },
    });
    categoriasCreadas[cat.codigo] = creada;
    for (const [j, item] of cat.items.entries()) {
      await CategoriaItem.findOrCreate({ where: { categoria_id: creada.id, nombre: item }, defaults: { orden: j } });
    }
  }

  // IMPORTANTE: `findOrCreate` por título, NUNCA `bulkCreate`. `cursos.titulo`
  // no tiene una restricción UNIQUE en la base de datos, así que
  // `bulkCreate(..., { ignoreDuplicates: true })` (usado antes aquí) no
  // detectaba nada que ignorar: cada reinicio del backend (autoRepair
  // corre este seed en CADA arranque, ver startup/autoRepair.js) insertaba
  // los 5 cursos de nuevo con un id distinto, dejando el catálogo lleno de
  // cursos repetidos tras varios reinicios (típico con nodemon en
  // desarrollo). `findOrCreate` sí es idempotente: solo crea el curso la
  // primera vez.
  const cursosSeed = [
    { titulo: 'Inteligencia Artificial aplicada a Negocios', duracion_horas: 20, videos_count: 3, rating: 4.9 },
    { titulo: 'Power BI Avanzado y Modelado de Datos', duracion_horas: 16, videos_count: 3, rating: 4.8 },
    { titulo: 'Excel Corporativo y Macros', duracion_horas: 12, videos_count: 3, rating: 4.7 },
    { titulo: 'Liderazgo y Gestión de Equipos Híbridos', duracion_horas: 15, videos_count: 3, rating: 4.9 },
    { titulo: 'Salud Mental y Prevención del Burnout', duracion_horas: 8, videos_count: 3, rating: 5.0 },
  ];
  for (const { titulo, ...defaults } of cursosSeed) {
    await Curso.findOrCreate({ where: { titulo }, defaults });
  }

  // Videos reales de YouTube por curso (datos de ejemplo, sobre el mismo
  // tema del curso, para que la Academia se pueda ver y usar funcionando de
  // verdad en vez de la simulación anterior de "avanza por dar clic".
  // `videos_count` de arriba ya no se usa para calcular el progreso (ver
  // colaboradorController.academia/actualizarProgresoCurso): el progreso
  // real se calcula sobre estas filas. Se usa `findOrCreate` por
  // (curso_id, orden) para que sea idempotente igual que el resto del seed.
  const videosPorCurso = {
    'Inteligencia Artificial aplicada a Negocios': [
      { titulo: 'Revoluciona tu negocio con Inteligencia Artificial Generativa', url: 'https://www.youtube.com/watch?v=z8YbT8gyLx0', minutos: 18 },
      { titulo: 'Cómo implementar Inteligencia Artificial en tu negocio', url: 'https://www.youtube.com/watch?v=uXrjPy7Dm0Y', minutos: 15 },
      { titulo: 'La Inteligencia Artificial y su impacto en los negocios', url: 'https://www.youtube.com/watch?v=0eN0RbsIKiA', minutos: 12 },
    ],
    'Power BI Avanzado y Modelado de Datos': [
      { titulo: 'Crea un dashboard Power BI profesional en 2 horas', url: 'https://www.youtube.com/watch?v=YaiS6eWCFQQ', minutos: 120 },
      { titulo: 'Power BI tutorial desde cero (curso completo)', url: 'https://www.youtube.com/watch?v=OQ0IpdT-KuI', minutos: 90 },
      { titulo: 'Curso de Power BI desde cero: datos, gráficos y reporte profesional', url: 'https://www.youtube.com/watch?v=vufMFnWpINo', minutos: 60 },
    ],
    'Excel Corporativo y Macros': [
      { titulo: 'Curso gratuito de macros en Excel — parte 1', url: 'https://www.youtube.com/watch?v=EpJLE4Kdai0', minutos: 20 },
      { titulo: 'Curso de macros en Excel con VBA desde cero a experto', url: 'https://www.youtube.com/watch?v=0kSL1ItQmBY', minutos: 45 },
      { titulo: 'Macros fáciles en Excel para principiantes', url: 'https://www.youtube.com/watch?v=FyjD8xcA-Fk', minutos: 11 },
    ],
    'Liderazgo y Gestión de Equipos Híbridos': [
      { titulo: 'Liderazgo de equipos remotos e híbridos', url: 'https://www.youtube.com/watch?v=R7nwg69xhuk', minutos: 25 },
      { titulo: 'Liderazgo de equipos híbridos en la nueva realidad', url: 'https://www.youtube.com/watch?v=ldjwrzl4mEM', minutos: 22 },
      { titulo: 'Cómo liderar y gestionar equipos remotos', url: 'https://www.youtube.com/watch?v=12A0NO8RkA0', minutos: 18 },
    ],
    'Salud Mental y Prevención del Burnout': [
      { titulo: 'Hablemos de burnout: salud mental y trabajo', url: 'https://www.youtube.com/watch?v=cpHXOX_RdW8', minutos: 20 },
      { titulo: 'Promoción y prevención de la salud mental', url: 'https://www.youtube.com/watch?v=y8Wst8ZuF2s', minutos: 15 },
      { titulo: 'Síndrome de burnout o desgaste laboral', url: 'https://www.youtube.com/watch?v=HWBkqJ7gZXQ', minutos: 14 },
    ],
  };
  const cursosCreados = await Curso.findAll({ where: { titulo: Object.keys(videosPorCurso) } });
  for (const curso of cursosCreados) {
    const videos = videosPorCurso[curso.titulo] || [];
    for (const [i, v] of videos.entries()) {
      await CursoVideo.findOrCreate({
        where: { curso_id: curso.id, orden: i + 1 },
        defaults: { titulo: v.titulo, url_youtube: v.url, duracion_minutos: v.minutos },
      });
    }
  }

  // Evaluación final de opción múltiple por curso: el certificado ya no se
  // activa solo con ver los videos (ver colaboradorController.
  // evaluarFinalizacionCurso) — el colaborador tiene que aprobar esto con
  // 70% o más. `findOrCreate` por (curso_id, orden), igual patrón que los
  // videos, para que el seed sea idempotente.
  const preguntasPorCurso = {
    'Inteligencia Artificial aplicada a Negocios': [
      { texto: '¿Cuál de estas es una aplicación típica de la IA generativa en negocios?', opciones: ['Generar borradores de contenido y correos automáticamente', 'Reemplazar el cableado eléctrico de la oficina', 'Imprimir facturas en papel', 'Ninguna de las anteriores'], correcta: 0 },
      { texto: 'Antes de implementar IA en un proceso de negocio, lo primero que se recomienda es:', opciones: ['Comprar la licencia más cara disponible', 'Identificar un caso de uso concreto y medible', 'Despedir al equipo de datos', 'Esperar a que la competencia lo haga primero'], correcta: 1 },
      { texto: 'Un riesgo real de usar IA generativa sin supervisión humana es:', opciones: ['Que sea demasiado rápida', 'Que genere respuestas incorrectas ("alucinaciones") presentadas con seguridad', 'Que no tenga costo', 'Que funcione sin internet'], correcta: 1 },
    ],
    'Power BI Avanzado y Modelado de Datos': [
      { texto: '¿Qué lenguaje se usa en Power BI para crear medidas y columnas calculadas?', opciones: ['DAX', 'HTML', 'SQL únicamente', 'Python obligatoriamente'], correcta: 0 },
      { texto: 'Un modelo de datos en estrella (star schema) se caracteriza por tener:', opciones: ['Solo una tabla con todos los datos', 'Tablas de hechos conectadas a tablas de dimensiones', 'Ninguna relación entre tablas', 'Solo gráficos, sin tablas'], correcta: 1 },
      { texto: '¿Para qué sirve principalmente un dashboard en Power BI?', opciones: ['Para almacenar contraseñas', 'Para visualizar y monitorear indicadores clave de forma interactiva', 'Para enviar correos automáticos', 'Para editar videos'], correcta: 1 },
    ],
    'Excel Corporativo y Macros': [
      { texto: 'Una macro en Excel sirve principalmente para:', opciones: ['Automatizar tareas repetitivas', 'Cambiar el color del sistema operativo', 'Conectarse a redes sociales', 'Formatear el disco duro'], correcta: 0 },
      { texto: '¿En qué lenguaje se programan las macros de Excel (VBA)?', opciones: ['Java', 'Visual Basic for Applications', 'C++', 'Swift'], correcta: 1 },
      { texto: 'La forma más sencilla de crear una macro sin programar es:', opciones: ['Escribiendo código desde cero', 'Usando la grabadora de macros', 'Editando el registro de Windows', 'Instalando un antivirus'], correcta: 1 },
    ],
    'Liderazgo y Gestión de Equipos Híbridos': [
      { texto: 'Un reto característico del liderazgo de equipos híbridos es:', opciones: ['Mantener la cohesión y comunicación entre quienes están presenciales y remotos', 'La falta de electricidad', 'Que todos usen el mismo celular', 'Que no exista internet'], correcta: 0 },
      { texto: 'Una buena práctica para reuniones híbridas efectivas es:', opciones: ['Ignorar a quienes están conectados remotamente', 'Asegurar que todos, presenciales y remotos, puedan participar por igual', 'Hacerlas sin agenda', 'Que duren más de 3 horas siempre'], correcta: 1 },
      { texto: 'La confianza en equipos remotos se construye principalmente con:', opciones: ['Vigilancia constante de pantalla', 'Comunicación clara, cumplimiento de acuerdos y resultados visibles', 'Prohibir el trabajo flexible', 'Reuniones diarias de 4 horas'], correcta: 1 },
    ],
    'Salud Mental y Prevención del Burnout': [
      { texto: 'El burnout se define principalmente como:', opciones: ['Un síndrome de agotamiento emocional por estrés laboral crónico', 'Una enfermedad contagiosa', 'Un tipo de vacación', 'Un beneficio corporativo'], correcta: 0 },
      { texto: 'Una señal de alerta temprana de burnout es:', opciones: ['Aumento de energía y motivación', 'Agotamiento persistente, cinismo y baja realización personal', 'Mejora en la calidad del sueño', 'Mayor interés en el trabajo'], correcta: 1 },
      { texto: '¿Qué se recomienda ante señales de burnout en un colaborador?', opciones: ['Ignorarlas hasta que pasen solas', 'Buscar apoyo profesional y ajustar la carga/organización del trabajo', 'Aumentar la carga de trabajo para "distraerlo"', 'Despedirlo de inmediato'], correcta: 1 },
    ],
  };
  const cursosParaQuiz = await Curso.findAll({ where: { titulo: Object.keys(preguntasPorCurso) } });
  for (const curso of cursosParaQuiz) {
    const preguntas = preguntasPorCurso[curso.titulo] || [];
    for (const [i, p] of preguntas.entries()) {
      await CursoPregunta.findOrCreate({
        where: { curso_id: curso.id, orden: i + 1 },
        defaults: { texto: p.texto, opciones: p.opciones, respuesta_correcta: p.correcta },
      });
    }
  }

  await Competencia.bulkCreate(
    [
      'Liderazgo', 'Comunicación', 'Trabajo en equipo', 'Innovación', 'Orientación al cliente', 'Planeación',
      'Productividad', 'Adaptabilidad', 'Pensamiento estratégico', 'Resolución de problemas', 'Inteligencia emocional',
      'Gestión del cambio', 'Toma de decisiones',
    ].map((nombre) => ({ nombre })),
    { ignoreDuplicates: true }
  );

  await TipoEvaluacion.bulkCreate(
    [
      { codigo: '90', nombre: 'Evaluación 90°' },
      { codigo: '180', nombre: 'Evaluación 180°' },
      { codigo: '270', nombre: 'Evaluación 270°' },
      { codigo: '360', nombre: 'Evaluación 360°' },
    ],
    { ignoreDuplicates: true }
  );

  return categoriasCreadas;
}

async function seedUsuariosDemo(roles, categorias) {
  const [empresa, empresaCreada] = await Empresa.findOrCreate({
    where: { nit: '900123456-1' },
    defaults: { nombre: 'Colautos', plan: 'profesional' },
  });

  // Los usuarios/registros de demostración de esta función SOLO se crean la
  // primera vez que el backend arranca contra una base de datos vacía (el
  // mismo momento en que la empresa demo también se crea). En cualquier
  // restart posterior se saltan por completo.
  //
  // Antes se recreaban en CADA restart vía `Usuario.findOrCreate({where:
  // {email: '...'}})`, buscando por email. Eso es el mismo tipo de bug que
  // ya mordió con los cursos duplicados (ver seedCatalogos más abajo:
  // bulkCreate/findOrCreate sobre una columna que en la práctica no es una
  // llave estable), pero aquí la causa es más sutil: el email SÍ es único en
  // la base de datos, el problema es que es precisamente el dato que un
  // administrador cambia legítimamente después del primer arranque (por
  // ejemplo, con un script SQL para renombrar una cuenta demo a un correo
  // real). En cuanto eso pasa, `karen@colautos.com` deja de existir y el
  // siguiente restart del backend (autoRepair vuelve a llamar a
  // `ejecutarSeed()` en cada arranque) lo vuelve a crear desde cero como una
  // fila NUEVA — el admin terminaba viendo tanto la cuenta ya renombrada
  // como un usuario "fantasma" resucitado con el correo viejo, sin haberlo
  // creado él mismo ni poder borrarlo de forma permanente (reaparecía en el
  // próximo restart). Limitar todo este bootstrap a la primera vez elimina
  // el problema de raíz: después del primer arranque, estas cuentas son
  // datos de negocio normales que un administrador puede renombrar,
  // reasignar o inactivar sin que nada las vuelva a crear.
  if (!empresaCreada) {
    return;
  }

  const passwordHash = await hashPassword(PASSWORD_DEMO);

  const [superAdminUser] = await Usuario.findOrCreate({
    where: { email: 'superadmin@ditash.com' },
    defaults: {
      nombre: 'Super Administrador DITASH',
      password_hash: passwordHash,
      rol_id: roles.superAdmin.id,
      estado: 'activo',
      debe_cambiar_pass: true,
    },
  });

  const [rrhhUser] = await Usuario.findOrCreate({
    where: { email: 'rrhh@colautos.com' },
    defaults: {
      nombre: 'Ana Torres',
      password_hash: passwordHash,
      rol_id: roles.adminEmpresa.id,
      empresa_id: empresa.id,
      cargo: 'Directora de Gestión Humana',
      estado: 'activo',
      debe_cambiar_pass: true,
    },
  });

  const [karenUser] = await Usuario.findOrCreate({
    where: { email: 'karen@colautos.com' },
    defaults: {
      nombre: 'Karen Ramírez',
      password_hash: passwordHash,
      rol_id: roles.colaborador.id,
      empresa_id: empresa.id,
      cargo: 'Especialista de Procesos',
      area: 'Operaciones',
      estado: 'activo',
      debe_cambiar_pass: true,
    },
  });
  await Colaborador.findOrCreate({
    where: { usuario_id: karenUser.id },
    defaults: { empresa_id: empresa.id, cargo: 'Especialista de Procesos', area: 'Operaciones', fecha_ingreso: '2023-03-01' },
  });

  const [psicologaUser] = await Usuario.findOrCreate({
    where: { email: 'liliana.gomez@ditash.com' },
    defaults: { nombre: 'Dra. Liliana Gómez', password_hash: passwordHash, rol_id: roles.especialista.id, estado: 'activo', debe_cambiar_pass: true },
  });
  const [especialistaDemo] = await Especialista.findOrCreate({
    where: { usuario_id: psicologaUser.id },
    defaults: {
      categoria_id: categorias.bienestar_emocional.id,
      especialidad: 'Psicóloga Clínica',
      tarifa_base: 90000,
      pct_comision: 15,
      verificado: true,
    },
  });
  // `findOrCreate` SOLO aplica `defaults` cuando crea la fila: si esta
  // especialista demo ya existía de una corrida anterior del seed (de antes
  // de que `verificado: true` estuviera en los defaults, por ejemplo), se
  // quedaba para siempre con `verificado: false` sin que ningún cambio
  // posterior a este archivo la "curara" — y con eso, `/colaborador/agenda`
  // seguía mostrando "No hay especialistas disponibles" aunque el horario
  // ya estuviera bien cargado. Se fuerza aquí para que el seed sea
  // idempotente de verdad, no solo en la primera corrida.
  await especialistaDemo.update({
    activo: true,
    verificado: true,
    categoria_id: categorias.bienestar_emocional.id,
  });
  // Disponibilidad de lunes a viernes (1-5), mañana y tarde, para que la
  // especialista demo tenga horarios reales casi cualquier día que se
  // pruebe el agendamiento — con un único bloque (ej. "solo lunes 8-12")
  // la demo parece rota en cuanto se prueba otro día de la semana.
  for (let diaSemana = 1; diaSemana <= 5; diaSemana += 1) {
    await EspecialistaHorario.findOrCreate({
      where: { especialista_id: especialistaDemo.id, dia_semana: diaSemana, hora_inicio: '08:00' },
      defaults: { hora_fin: '12:00', activo: true },
    });
    await EspecialistaHorario.findOrCreate({
      where: { especialista_id: especialistaDemo.id, dia_semana: diaSemana, hora_inicio: '14:00' },
      defaults: { hora_fin: '18:00', activo: true },
    });
  }

  // Encuesta de clima demo, ya activa, para que el módulo de "Encuestas de
  // Clima" del colaborador no aparezca vacío en la primera prueba (el
  // sistema no crea ninguna encuesta por sí solo: eso es responsabilidad de
  // RRHH, pero conviene tener una de ejemplo lista para probar el flujo).
  const hoy = new Date();
  const en30dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [encuestaDemo] = await EncuestaClima.findOrCreate({
    where: { empresa_id: empresa.id, titulo: 'Clima organizacional — Trimestre actual' },
    defaults: {
      tipo: 'clima_general',
      anonima: true,
      fecha_inicio: hoy.toISOString().slice(0, 10),
      fecha_fin: en30dias.toISOString().slice(0, 10),
      estado: 'activa',
    },
  });
  // MISMO patrón de bug que ya mordió 2 veces antes (Especialista.verificado,
  // EncuestaPregunta): `findOrCreate` solo aplica `defaults` cuando CREA la
  // fila. La columna `estado` se agregó en una ronda posterior a cuando esta
  // encuesta demo ya existía en instalaciones viejas, y al agregarla vía
  // `ALTER TABLE ... ADD COLUMN` con un DEFAULT, MySQL le puso ese default
  // ('borrador') a la fila YA EXISTENTE — nunca pasó por `defaults: {estado:
  // 'activa'}` de arriba. Resultado: la encuesta aparecía en el listado de
  // RRHH (que no filtra por estado) pero nunca en el del colaborador (que sí
  // exige `estado = 'activa'` y fechas vigentes) — el síntoma exacto de "no
  // salen las encuestas". Se fuerza aquí, igual que con la especialista
  // demo, para que quede realmente idempotente sin importar en qué ronda se
  // haya creado la fila originalmente.
  await encuestaDemo.update({
    estado: 'activa',
    fecha_inicio: encuestaDemo.fecha_inicio || hoy.toISOString().slice(0, 10),
    fecha_fin: en30dias.toISOString().slice(0, 10),
  });
  // Antes esto solo corría `if (encuestaCreada)`: si la encuesta ya existía
  // de una corrida anterior (por ejemplo, porque el bulkCreate falló una vez
  // y dejó la encuesta creada pero sin preguntas), `encuestaCreada` daba
  // `false` para siempre y este bloque nunca se volvía a ejecutar — la
  // encuesta se quedaba con "0 preguntas" de manera permanente. Se usa
  // `findOrCreate` por pregunta (clave: encuesta_id + orden) para que el
  // seed se auto-sane en cualquier corrida, exista ya la encuesta o no.
  const preguntasDemo = [
    { texto: '¿Qué tan satisfecho/a estás con tu ambiente de trabajo?', tipo: 'escala_1_5', orden: 1 },
    { texto: '¿Sientes que tu carga de trabajo es manejable?', tipo: 'escala_1_5', orden: 2 },
    { texto: '¿Recomendarías a esta empresa como un buen lugar para trabajar?', tipo: 'si_no', orden: 3 },
    { texto: '¿Qué podríamos mejorar?', tipo: 'texto_libre', orden: 4 },
  ];
  for (const p of preguntasDemo) {
    await EncuestaPregunta.findOrCreate({
      where: { encuesta_id: encuestaDemo.id, orden: p.orden },
      defaults: { texto: p.texto, tipo: p.tipo },
    });
  }

  console.log('\n=== Usuarios de demostración creados ===');
  console.log('Todos con contraseña temporal:', PASSWORD_DEMO, '(se exige cambio en el primer login)\n');
  console.log(' SUPER_ADMIN   ->', superAdminUser.email);
  console.log(' ADMIN_EMPRESA ->', rrhhUser.email);
  console.log(' COLABORADOR   ->', karenUser.email);
  console.log(' ESPECIALISTA  ->', psicologaUser.email);
}

// Orquesta las 3 fases del seed. Se puede llamar tantas veces como se
// quiera sin romper nada: `seedRolesYPermisos` y `seedCatalogos` son
// catálogos de plataforma (roles, permisos, categorías, competencias) que sí
// deben auto-repararse en cada arranque; `seedUsuariosDemo`, en cambio, solo
// bootstrapea las cuentas y datos de ejemplo la primera vez (ver el comentario
// dentro de esa función) para no resucitar cuentas demo que un administrador
// ya renombró, reasignó o eliminó después del primer arranque.
// Se exporta (en vez de solo llamarse desde `main`) para que el propio
// backend pueda auto-ejecutarlo en cada arranque (ver
// src/startup/autoRepair.js) y así los catálogos de plataforma se
// auto-reparen solos sin depender de que alguien recuerde correr
// `npm run seed` a mano después de cada cambio de esquema.
async function ejecutarSeed() {
  const roles = await seedRolesYPermisos();
  const categorias = await seedCatalogos();
  await seedUsuariosDemo(roles, categorias);
}

async function main() {
  await sequelize.authenticate();
  await ejecutarSeed();
  console.log('\n✅ Seed completado exitosamente.');
  process.exit(0);
}

// Solo corre automáticamente cuando se invoca por CLI (`npm run seed`); si
// otro módulo hace `require('./seed')` para reutilizar `ejecutarSeed`, no
// queremos que además dispare `main()` (que llama `process.exit`).
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Error en el seed:', err);
    process.exit(1);
  });
}

module.exports = { ejecutarSeed, seedRolesYPermisos, seedCatalogos, seedUsuariosDemo };
