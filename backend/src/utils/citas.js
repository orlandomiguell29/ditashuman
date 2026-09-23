// Detección de solapamiento de citas de un especialista. Se usa tanto al
// agendar una cita nueva como al reasignar una existente (desde el
// colaborador o desde el propio especialista) — ver colaboradorController.js
// y especialistaController.js.
//
// Antes se comparaba solo la hora EXACTA de inicio (`fecha_hora: fechaHora`),
// lo cual bastaba mientras todas las citas duraban 60 minutos fijos. Ahora
// que la duración es parametrizable por especialista
// (Especialista.duracion_minutos), dos citas pueden solaparse sin compartir
// la misma hora de inicio, así que se compara el rango real (inicio/fin) de
// cada una.
const { Op, literal } = require('sequelize');
const { Cita } = require('../models');

// Después de cuánto tiempo de terminada una cita (fecha_hora + duración) se
// considera vencida si nadie la marcó como completada ni cancelada. No es
// inmediato al terminar la hora: le da margen al especialista para dar clic
// en "Marcar completada" sin que la cita cambie de estado sola mientras
// todavía está en curso o recién terminó.
const GRACIA_MINUTOS_ANTES_DE_VENCER = 60;

// Pasa a 'no_asistio' cualquier cita 'pendiente' o 'confirmada' cuya hora +
// duración + el margen de arriba ya quedó en el pasado. Antes ninguna cita
// cambiaba de estado sola: una cita de ayer a las 3pm que nadie tocó seguía
// mostrándose "Confirmada" para siempre, como si todavía fuera a ocurrir.
// Se llama al inicio de cualquier endpoint que lea o dependa del estado de
// citas (listados de colaborador/especialista, chequeo de horarios
// disponibles, detección de solapamiento al agendar/reasignar) para que el
// dato siempre esté al día en el momento en que alguien lo consulta — no
// hace falta un proceso en segundo plano (cron) para esto.
//
// `no_asistio` (no dos veces "cancelada", que implica que alguien la
// canceló a propósito) dice honestamente lo que se sabe: la cita pasó y
// nadie confirmó que ocurrió. No genera comisión (eso solo pasa al marcar
// "completada" a mano, ver especialistaController.marcarCompletada).
async function expirarCitasVencidas() {
  try {
    await Cita.update(
      { estado: 'no_asistio' },
      {
        where: {
          estado: { [Op.in]: ['pendiente', 'confirmada'] },
          [Op.and]: literal(
            `DATE_ADD(fecha_hora, INTERVAL (COALESCE(duracion_min, 60) + ${GRACIA_MINUTOS_ANTES_DE_VENCER}) MINUTE) < NOW()`
          ),
        },
      }
    );
  } catch {
    // No debe tumbar la petición que la disparó: si esto falla (p. ej. un
    // problema puntual de conexión a la base de datos), simplemente se
    // reintenta en la próxima lectura de citas.
  }
}

/**
 * @param {number} especialistaId
 * @param {Date} fechaHora inicio propuesto de la cita
 * @param {number} duracionMin duración en minutos de la cita propuesta
 * @param {number|null} excluirCitaId al reasignar, la propia cita no debe compararse contra sí misma
 * @returns {Promise<boolean>}
 */
async function existeSolapamiento(especialistaId, fechaHora, duracionMin, excluirCitaId = null) {
  const where = {
    especialista_id: especialistaId,
    estado: { [Op.in]: ['pendiente', 'confirmada'] },
  };
  if (excluirCitaId) where.id = { [Op.ne]: excluirCitaId };

  const citasExistentes = await Cita.findAll({ where, attributes: ['id', 'fecha_hora', 'duracion_min'] });

  const inicioNueva = fechaHora.getTime();
  const finNueva = inicioNueva + (duracionMin || 60) * 60 * 1000;

  return citasExistentes.some((c) => {
    const inicio = new Date(c.fecha_hora).getTime();
    const fin = inicio + (c.duracion_min || 60) * 60 * 1000;
    return inicioNueva < fin && finNueva > inicio;
  });
}

module.exports = { existeSolapamiento, expirarCitasVencidas };
