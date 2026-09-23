const { z } = require('zod');
const { Op } = require('sequelize');
const { Especialista, EspecialistaHorario, Cita, Comision, Colaborador, Usuario } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');
const { existeSolapamiento, expirarCitasVencidas } = require('../utils/citas');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');

async function miEspecialista(usuarioId) {
  const especialista = await Especialista.findOne({ where: { usuario_id: usuarioId } });
  if (!especialista) throw new HttpError(404, 'Perfil de especialista no encontrado para este usuario.');
  return especialista;
}

async function agenda(req, res, next) {
  try {
    await expirarCitasVencidas();
    const especialista = await miEspecialista(req.user.id);
    const [horarios, citas] = await Promise.all([
      EspecialistaHorario.findAll({ where: { especialista_id: especialista.id } }),
      Cita.findAll({
        where: { especialista_id: especialista.id },
        include: [{ model: Colaborador, include: [{ model: Usuario, attributes: ['nombre'] }] }],
        order: [['fecha_hora', 'ASC']],
      }),
    ]);
    res.json({ data: { especialista, horarios, citas } });
  } catch (err) {
    next(err);
  }
}

// Antes solo un SUPER_ADMIN podía cambiar la duración de las citas de un
// especialista (Admin > Especialistas), y el propio especialista solo veía
// un texto fijo diciendo "contacta a tu administrador". Es un parámetro de
// su propia agenda (cuánto dura cada bloque que se le ofrece al
// colaborador), así que tiene sentido que lo pueda ajustar él mismo sin
// depender de un tercero — igual rango 15–240 min que ya se validaba del
// lado admin, por la misma razón (menos de 15 no es útil, más de 240 casi
// seguro es un error de captura).
const actualizarDuracionSchema = z.object({
  body: z.object({ duracionMinutos: z.coerce.number().int().min(15).max(240) }).strict(),
  query: z.any(),
  params: z.any(),
});

async function actualizarDuracion(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    especialista.duracion_minutos = req.body.duracionMinutos;
    await especialista.save();
    await registrarAuditoria({
      req,
      accion: 'actualizar_duracion_cita',
      entidad: 'especialistas',
      entidadId: especialista.id,
      detalles: { duracionMinutos: req.body.duracionMinutos },
    });
    res.json({ data: especialista });
  } catch (err) {
    next(err);
  }
}

const horarioSchema = z.object({
  body: z
    .object({
      diaSemana: z.coerce.number().int().min(0).max(6),
      horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
      horaFin: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

// Evita que un especialista defina dos franjas que se solapan en el mismo
// día (p. ej. Lunes 08:00-12:00 y Lunes 10:00-14:00): antes no había
// ninguna validación de esto, lo que podía duplicar horarios ofrecidos al
// colaborador de forma confusa. `excluirId` se usa al editar, para no
// comparar la franja contra sí misma.
async function franjaSeSolapa(especialistaId, diaSemana, horaInicio, horaFin, excluirId = null) {
  const where = { especialista_id: especialistaId, dia_semana: diaSemana };
  if (excluirId) where.id = { [Op.ne]: excluirId };
  const franjasDelDia = await EspecialistaHorario.findAll({ where });
  return franjasDelDia.some((f) => horaInicio < f.hora_fin && horaFin > f.hora_inicio);
}

async function crearHorario(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    if (req.body.horaFin <= req.body.horaInicio) throw new HttpError(400, 'La hora fin debe ser posterior a la hora inicio.');
    if (await franjaSeSolapa(especialista.id, req.body.diaSemana, req.body.horaInicio, req.body.horaFin)) {
      throw new HttpError(409, 'Ya tienes una franja horaria que se solapa con esta, para ese día.');
    }

    const horario = await EspecialistaHorario.create({
      especialista_id: especialista.id,
      dia_semana: req.body.diaSemana,
      hora_inicio: req.body.horaInicio,
      hora_fin: req.body.horaFin,
    });
    await registrarAuditoria({ req, accion: 'crear_horario', entidad: 'especialista_horarios', entidadId: horario.id });
    res.status(201).json({ data: horario });
  } catch (err) {
    next(err);
  }
}

// Editar una franja existente (antes solo se podía crear o eliminar; para
// cambiar un horario había que borrarlo y crear uno nuevo, perdiendo su id
// y el orden en la lista).
async function actualizarHorario(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const horario = await EspecialistaHorario.findOne({ where: { id: req.params.id, especialista_id: especialista.id } });
    if (!horario) throw new HttpError(404, 'Horario no encontrado.');
    if (req.body.horaFin <= req.body.horaInicio) throw new HttpError(400, 'La hora fin debe ser posterior a la hora inicio.');
    if (await franjaSeSolapa(especialista.id, req.body.diaSemana, req.body.horaInicio, req.body.horaFin, horario.id)) {
      throw new HttpError(409, 'Ya tienes una franja horaria que se solapa con esta, para ese día.');
    }

    horario.dia_semana = req.body.diaSemana;
    horario.hora_inicio = req.body.horaInicio;
    horario.hora_fin = req.body.horaFin;
    await horario.save();
    await registrarAuditoria({ req, accion: 'actualizar_horario', entidad: 'especialista_horarios', entidadId: horario.id });
    res.json({ data: horario });
  } catch (err) {
    next(err);
  }
}

async function eliminarHorario(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const horario = await EspecialistaHorario.findOne({ where: { id: req.params.id, especialista_id: especialista.id } });
    if (!horario) throw new HttpError(404, 'Horario no encontrado.');
    await horario.destroy();
    await registrarAuditoria({ req, accion: 'eliminar_horario', entidad: 'especialista_horarios', entidadId: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Confirma una cita pendiente (el especialista la revisó y la acepta
// explícitamente). No es obligatorio pasar por aquí antes de completarla,
// pero le da al colaborador visibilidad de que alguien ya la vio.
async function confirmarCita(req, res, next) {
  try {
    await expirarCitasVencidas();
    const especialista = await miEspecialista(req.user.id);
    const cita = await Cita.findOne({ where: { id: req.params.id, especialista_id: especialista.id } });
    if (!cita) throw new HttpError(404, 'Cita no encontrada.');
    if (cita.estado !== 'pendiente') throw new HttpError(409, 'Solo una cita pendiente puede confirmarse.');

    cita.estado = 'confirmada';
    await cita.save();
    await registrarAuditoria({ req, accion: 'confirmar_cita', entidad: 'citas', entidadId: cita.id });
    res.json({ data: cita });
  } catch (err) {
    next(err);
  }
}

// Cancelación por parte del especialista (imprevisto, indisponibilidad).
// Igual que la cancelación del colaborador: nunca se borra la cita, solo
// cambia de estado, preservando el historial para auditoría/soporte.
async function cancelarCita(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const cita = await Cita.findOne({ where: { id: req.params.id, especialista_id: especialista.id } });
    if (!cita) throw new HttpError(404, 'Cita no encontrada.');
    if (!['pendiente', 'confirmada'].includes(cita.estado)) throw new HttpError(409, 'Esta cita ya no puede cancelarse.');

    cita.estado = 'cancelada';
    await cita.save();
    await registrarAuditoria({ req, accion: 'cancelar_cita_especialista', entidad: 'citas', entidadId: cita.id });
    res.json({ data: cita });
  } catch (err) {
    next(err);
  }
}

const reagendarCitaSchema = z.object({
  body: z
    .object({
      fechaHora: z.string().datetime(),
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

// El especialista puede reasignar (cambiar fecha/hora) una cita propia sin
// la restricción de 24 horas que sí aplica al colaborador (ver
// colaboradorController.reagendarCita): es quien administra su propia
// agenda, así que puede reorganizarla incluso a último momento si le surge
// un imprevisto. La cita vuelve a 'pendiente' porque una confirmación
// previa era para la fecha/hora vieja, no para la nueva.
async function reagendarCita(req, res, next) {
  try {
    await expirarCitasVencidas();
    const especialista = await miEspecialista(req.user.id);
    const cita = await Cita.findOne({ where: { id: req.params.id, especialista_id: especialista.id } });
    if (!cita) throw new HttpError(404, 'Cita no encontrada.');
    if (!['pendiente', 'confirmada'].includes(cita.estado)) throw new HttpError(409, 'Esta cita ya no puede reasignarse.');

    const nuevaFecha = new Date(req.body.fechaHora);
    if (nuevaFecha <= new Date()) throw new HttpError(400, 'La nueva fecha de la cita debe ser futura.');

    // Conserva la duración que ya tenía la cita al validar el nuevo horario
    // contra el resto de la agenda del especialista (ver utils/citas.js).
    if (await existeSolapamiento(especialista.id, nuevaFecha, cita.duracion_min, cita.id)) {
      throw new HttpError(409, 'Ya tienes otra cita agendada en ese horario.');
    }

    cita.fecha_hora = nuevaFecha;
    cita.estado = 'pendiente';
    await cita.save();
    await registrarAuditoria({ req, accion: 'reagendar_cita_especialista', entidad: 'citas', entidadId: cita.id });
    res.json({ data: cita });
  } catch (err) {
    next(err);
  }
}

async function marcarCompletada(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const cita = await Cita.findOne({ where: { id: req.params.id, especialista_id: especialista.id } });
    if (!cita) throw new HttpError(404, 'Cita no encontrada.');
    if (cita.estado === 'completada') throw new HttpError(409, 'La cita ya está marcada como completada.');

    cita.estado = 'completada';
    await cita.save();

    // Generación automática de la comisión (15% por defecto, configurable por especialista).
    const montoComision = Math.round(Number(cita.tarifa) * (Number(especialista.pct_comision) / 100) * 100) / 100;
    const montoNeto = Math.round((Number(cita.tarifa) - montoComision) * 100) / 100;
    const hoy = new Date();
    const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${hoy.getDate() <= 15 ? 'Q1' : 'Q2'}`;

    const comision = await Comision.create({
      especialista_id: especialista.id,
      cita_id: cita.id,
      monto_bruto: cita.tarifa,
      pct_comision: especialista.pct_comision,
      monto_comision: montoComision,
      monto_neto: montoNeto,
      periodo_liquidacion: periodo,
    });

    await registrarAuditoria({ req, accion: 'completar_cita', entidad: 'citas', entidadId: cita.id });
    res.json({ data: { cita, comision } });
  } catch (err) {
    next(err);
  }
}

async function ingresos(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const comisiones = await Comision.findAll({ where: { especialista_id: especialista.id }, order: [['id', 'DESC']] });
    const totalNeto = comisiones.filter((c) => c.estado !== 'retenido').reduce((acc, c) => acc + Number(c.monto_neto), 0);
    res.json({
      data: {
        pctComision: especialista.pct_comision,
        totalNetoAcumulado: Math.round(totalNeto * 100) / 100,
        comisiones,
      },
    });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Cita', key: 'cita_id' },
  { header: 'Bruto', key: 'monto_bruto' },
  { header: '% Comisión', key: 'pct_comision' },
  { header: 'Comisión', key: 'monto_comision' },
  { header: 'Neto', key: 'monto_neto' },
  { header: 'Periodo', key: 'periodo_liquidacion' },
  { header: 'Estado', key: 'estado' },
];

async function exportarIngresos(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const format = (req.query.format || 'csv').toLowerCase();
    const rows = (await Comision.findAll({ where: { especialista_id: especialista.id } })).map((c) => c.get({ plain: true }));

    await registrarAuditoria({ req, accion: 'exportar_ingresos', entidad: 'comisiones', detalles: { formato: format } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Ingresos');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="ingresos.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ingresos.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

const citasExportColumns = [
  { header: 'Fecha', key: 'fecha' },
  { header: 'Hora', key: 'hora' },
  { header: 'Colaborador', key: 'colaboradorNombre' },
  { header: 'Estado', key: 'estado' },
  { header: 'Duración (min)', key: 'duracion_min' },
  { header: 'Motivo', key: 'motivo' },
];

// Exporta la agenda de citas del propio especialista a Excel/CSV, con un
// rango de fechas opcional (`fechaInicio`/`fechaFin`, formato YYYY-MM-DD,
// ambos inclusive). Sin filtro, exporta toda su historia de citas — antes
// no existía ninguna forma de sacar la agenda de la pantalla, había que
// copiarla a mano.
async function exportarCitas(req, res, next) {
  try {
    await expirarCitasVencidas();
    const especialista = await miEspecialista(req.user.id);
    const format = (req.query.format || 'csv').toLowerCase();

    const where = { especialista_id: especialista.id };
    if (req.query.fechaInicio || req.query.fechaFin) {
      where.fecha_hora = {};
      if (req.query.fechaInicio) where.fecha_hora[Op.gte] = new Date(`${req.query.fechaInicio}T00:00:00`);
      if (req.query.fechaFin) where.fecha_hora[Op.lte] = new Date(`${req.query.fechaFin}T23:59:59`);
    }

    // Dos consultas separadas + Map en memoria (no `include`) para no repetir
    // el patrón que ya causó bugs de listados vacíos en este proyecto cuando
    // ambas tablas involucradas tienen `id` — ver utils/citas.js y
    // empresaController.listarOkrs.
    const citas = await Cita.findAll({ where, order: [['fecha_hora', 'ASC']] });
    const colaboradorIds = [...new Set(citas.map((c) => c.colaborador_id).filter(Boolean))];
    const colaboradores = colaboradorIds.length
      ? await Colaborador.findAll({ where: { id: colaboradorIds }, include: [{ model: Usuario, attributes: ['nombre'] }] })
      : [];
    const colaboradorPorId = new Map(colaboradores.map((c) => [c.id, c]));

    const rows = citas.map((c) => {
      const plano = c.get({ plain: true });
      const fecha = new Date(plano.fecha_hora);
      return {
        ...plano,
        fecha: fecha.toLocaleDateString('es-CO'),
        hora: fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        colaboradorNombre: colaboradorPorId.get(plano.colaborador_id)?.Usuario?.nombre || '—',
      };
    });

    await registrarAuditoria({
      req,
      accion: 'exportar_citas',
      entidad: 'citas',
      detalles: { formato: format, fechaInicio: req.query.fechaInicio || null, fechaFin: req.query.fechaFin || null },
    });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, citasExportColumns, 'Mis citas');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="mis_citas.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, citasExportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mis_citas.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

// Página de inicio del especialista: antes entraba directo a "Agenda" (una
// lista de acción, no un panorama). Este resumen da el vistazo general —
// próximas citas, cuántas ha completado, cuánto ha generado — antes de
// entrar a trabajar en la agenda o en ingresos.
async function dashboard(req, res, next) {
  try {
    const especialista = await miEspecialista(req.user.id);
    const ahora = new Date();

    const [proximasCitas, totalCompletadas, comisiones] = await Promise.all([
      Cita.findAll({
        where: { especialista_id: especialista.id, estado: { [Op.in]: ['pendiente', 'confirmada'] }, fecha_hora: { [Op.gte]: ahora } },
        include: [{ model: Colaborador, include: [{ model: Usuario, attributes: ['nombre'] }] }],
        order: [['fecha_hora', 'ASC']],
        limit: 5,
      }),
      Cita.count({ where: { especialista_id: especialista.id, estado: 'completada' } }),
      Comision.findAll({ where: { especialista_id: especialista.id } }),
    ]);

    const totalNetoAcumulado = comisiones.filter((c) => c.estado !== 'retenido').reduce((acc, c) => acc + Number(c.monto_neto), 0);
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const netoDelMes = comisiones
      .filter((c) => c.estado !== 'retenido' && new Date(c.created_at || ahora) >= inicioMes)
      .reduce((acc, c) => acc + Number(c.monto_neto), 0);

    res.json({
      data: {
        especialista: { especialidad: especialista.especialidad, verificado: especialista.verificado, activo: especialista.activo },
        proximasCitas,
        totalCitasCompletadas: totalCompletadas,
        totalNetoAcumulado: Math.round(totalNetoAcumulado * 100) / 100,
        netoDelMes: Math.round(netoDelMes * 100) / 100,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboard,
  agenda,
  crearHorario,
  actualizarHorario,
  eliminarHorario,
  actualizarDuracion,
  confirmarCita,
  cancelarCita,
  reagendarCita,
  marcarCompletada,
  ingresos,
  exportarIngresos,
  exportarCitas,
  horarioSchema,
  reagendarCitaSchema,
  actualizarDuracionSchema,
};
