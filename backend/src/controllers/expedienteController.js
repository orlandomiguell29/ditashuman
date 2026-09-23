const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Colaborador, ExpedienteDocumento } = require('../models');
const { HttpError } = require('../middlewares/errorHandler');
const { registrarAuditoria } = require('../middlewares/audit');

// Sube documentos del expediente (hoja de vida, certificados, soportes SST).
// Los archivos se guardan en `uploads/` (fuera del alcance web público) y
// solo se sirven mediante `descargarDocumento()`, que revalida permisos en
// cada acceso — nunca se exponen por una URL estática servida directo.
async function subirDocumento(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'No se recibió ningún archivo.');

    const colaboradorId = req.body.colaboradorId || (await Colaborador.findOne({ where: { usuario_id: req.user.id } }))?.id;
    if (!colaboradorId) throw new HttpError(404, 'Colaborador no encontrado.');

    // Un colaborador solo puede subir a su propio expediente; RRHH puede
    // subir a cualquiera de SU EMPRESA (SUPER_ADMIN, a cualquiera).
    //
    // Antes el comentario decía "verificado en la ruta con RBAC", pero la
    // ruta (colaboradorRoutes.js) solo exige el permiso genérico
    // `colaboradores.leer`/`expedientes.crear` — no valida a qué empresa
    // pertenece el `colaboradorId` recibido en el body. Sin este chequeo,
    // un ADMIN_EMPRESA de una empresa podía subir un documento al
    // expediente de un colaborador de OTRA empresa con solo mandar su id
    // (fuga de datos entre clientes/tenants).
    if (req.user.rol === 'COLABORADOR') {
      const propio = await Colaborador.findOne({ where: { usuario_id: req.user.id } });
      if (!propio || String(propio.id) !== String(colaboradorId)) {
        fs.unlinkSync(req.file.path);
        throw new HttpError(403, 'No puedes subir documentos al expediente de otro colaborador.');
      }
    } else if (req.user.rol !== 'SUPER_ADMIN') {
      const colaborador = await Colaborador.findByPk(colaboradorId);
      if (!colaborador || colaborador.empresa_id !== req.user.empresaId) {
        fs.unlinkSync(req.file.path);
        throw new HttpError(403, 'Este colaborador no pertenece a tu empresa.');
      }
    }

    const buffer = fs.readFileSync(req.file.path);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    const documento = await ExpedienteDocumento.create({
      colaborador_id: colaboradorId,
      tipo: req.body.tipo || 'otro',
      nombre_original: req.file.originalname.slice(0, 255),
      ruta_almacenamiento: req.file.path,
      mime_type: req.file.mimetype,
      tamano_bytes: req.file.size,
      hash_sha256: hash,
      subido_por: req.user.id,
    });

    await registrarAuditoria({ req, accion: 'subir_documento', entidad: 'expediente_documentos', entidadId: documento.id });
    res.status(201).json({ data: documento });
  } catch (err) {
    next(err);
  }
}

// Verifica que el usuario autenticado pueda operar sobre este documento:
// su dueño (colaborador), o alguien con permiso elevado sobre expedientes
// (RRHH de la misma empresa / SUPER_ADMIN, validado por RBAC en la ruta).
async function documentoAccesible(req) {
  const documento = await ExpedienteDocumento.findByPk(req.params.id, { include: [Colaborador] });
  if (!documento) throw new HttpError(404, 'Documento no encontrado.');

  if (req.user.rol === 'COLABORADOR') {
    const propio = await Colaborador.findOne({ where: { usuario_id: req.user.id } });
    if (!propio || propio.id !== documento.colaborador_id) throw new HttpError(403, 'No puedes acceder al expediente de otro colaborador.');
  } else if (req.user.rol !== 'SUPER_ADMIN') {
    if (documento.Colaborador?.empresa_id !== req.user.empresaId) throw new HttpError(403, 'Este documento no pertenece a tu empresa.');
  }
  return documento;
}

// Descarga controlada: nunca se sirve el archivo por una ruta estática
// pública. Cada descarga revalida quién es el usuario y registra auditoría
// (trazabilidad de accesos a documentos potencialmente sensibles: hojas de
// vida, soportes médicos/SST).
async function descargarDocumento(req, res, next) {
  try {
    const documento = await documentoAccesible(req);
    if (!documento.activo) throw new HttpError(404, 'Este documento fue inactivado.');
    if (!fs.existsSync(documento.ruta_almacenamiento)) throw new HttpError(404, 'El archivo ya no está disponible en el almacenamiento.');

    await registrarAuditoria({ req, accion: 'descargar_documento', entidad: 'expediente_documentos', entidadId: documento.id });
    res.setHeader('Content-Type', documento.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(documento.nombre_original)}"`);
    res.sendFile(path.resolve(documento.ruta_almacenamiento));
  } catch (err) {
    next(err);
  }
}

// El expediente nunca borra un documento físicamente (coherente con el
// resto del sistema, ver utils/crudFactory.js): se inactiva, lo que lo
// oculta del expediente sin perder el archivo ni el registro de auditoría
// de quién lo subió — importante para soportes SST con obligación legal
// de conservación.
async function inactivarDocumento(req, res, next) {
  try {
    const documento = await documentoAccesible(req);
    await documento.update({ activo: false });
    await registrarAuditoria({ req, accion: 'inactivar_documento', entidad: 'expediente_documentos', entidadId: documento.id });
    res.json({ data: documento });
  } catch (err) {
    next(err);
  }
}

module.exports = { subirDocumento, descargarDocumento, inactivarDocumento };
