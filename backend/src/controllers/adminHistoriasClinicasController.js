const { z } = require('zod');
const { HistoriaClinica, Cita, Colaborador, Especialista, Usuario } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');

// Vista de plataforma completa (todas las empresas) para corrección
// administrativa de historias clínicas — exclusiva de SUPER_ADMIN (ver
// historiasClinicasAdminRoutes.js), igual criterio que auditoriaController:
// esto no es algo que un ADMIN_EMPRESA (RRHH de una empresa cliente) deba
// poder listar, aunque el catálogo de permisos tenga el código
// `historias_clinicas.leer` — ese permiso nunca se le asigna a ese rol (ver
// db/seed.js), y RBAC bloquea a cualquiera que no sea SUPER_ADMIN de todas
// formas.
//
// Solo trae historias 'finalizada' o 'anulada' — un 'borrador' es trabajo
// en curso del especialista, no algo sobre lo que un administrador deba
// poder actuar todavía.
async function listar(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const historias = await HistoriaClinica.findAll({
      where: { estado: ['finalizada', 'anulada'] },
      include: [
        { model: Cita, attributes: ['fecha_hora'] },
        { model: Colaborador, include: [{ model: Usuario, attributes: ['nombre'] }] },
        { model: Especialista, include: [{ model: Usuario, attributes: ['nombre'] }] },
      ],
      order: [['finalizada_en', 'DESC']],
      limit: 200,
    });

    const filtradas = q
      ? historias.filter((h) => {
          const texto = `${h.Colaborador?.Usuario?.nombre || ''} ${h.Especialista?.Usuario?.nombre || ''}`.toLowerCase();
          return texto.includes(q.toLowerCase());
        })
      : historias;

    res.json({ data: filtradas });
  } catch (err) {
    next(err);
  }
}

const anularSchema = z.object({
  body: z.object({ motivo: z.string().min(5, 'Describe el motivo de la anulación (mínimo 5 caracteres).').max(1000) }).strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

// Corrección administrativa: anula una historia 'finalizada' (nunca la
// borra) dejando constancia de motivo, quién la anuló y cuándo. Una vez
// anulada, el propio especialista ya no puede editarla ni volver a
// finalizarla (ver especialistaController.guardarHistoriaClinica) — si hace
// falta una nota correcta, el especialista debe diligenciar una nueva nota
// en una cita distinta; esto es deliberado: nunca se reescribe el registro
// original, solo se invalida con trazabilidad completa.
async function anular(req, res, next) {
  try {
    const hc = await HistoriaClinica.findByPk(req.params.id);
    if (!hc) throw new HttpError(404, 'Historia clínica no encontrada.');
    if (hc.estado !== 'finalizada') {
      throw new HttpError(409, 'Solo se puede anular una historia clínica que ya esté finalizada.');
    }

    await hc.update({
      estado: 'anulada',
      anulada_motivo: req.body.motivo,
      anulada_por_id: req.user.id,
      anulada_en: new Date(),
    });

    await registrarAuditoria({ req, accion: 'anular_historia_clinica', entidad: 'historias_clinicas', entidadId: hc.id });
    res.json({ data: hc });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, anular, anularSchema };
