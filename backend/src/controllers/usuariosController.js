const { z } = require('zod');
const { sequelize, Usuario, Rol, Empresa, Colaborador, Especialista } = require('../models');
const { hashPassword, PASSWORD_POLICY_REGEX } = require('../utils/password');
const { toCsv, toXlsxBuffer } = require('../utils/exporter');
const { registrarAuditoria } = require('../middlewares/audit');
const { HttpError } = require('../middlewares/errorHandler');
const { logoutAll } = require('../services/authService');
const { correoBienvenida, correoPasswordTemporal } = require('../utils/mailer');

// =============================================================================
// Módulo de administración de Usuarios. Es el módulo que reemplaza la
// ausencia total de gestión de usuarios/roles/permisos del prototipo
// original. Aquí se decide, según el ROL asignado, si además del usuario
// se debe crear su perfil de negocio asociado:
//   - rol COLABORADOR  -> crea automáticamente su fila en `colaboradores`
//     (sin esto, el dashboard de Colaborador no tiene de dónde leer datos).
//   - rol ESPECIALISTA -> crea automáticamente su fila en `especialistas`
//     (requiere especialidad y tarifa base en el alta).
//   - otros roles (SUPER_ADMIN, ADMIN_EMPRESA, roles custom) -> solo usuario.
// =============================================================================

const crearUsuarioSchema = z.object({
  body: z
    .object({
      nombre: z.string().min(2).max(150),
      email: z.string().email().max(190),
      password: z.string().regex(PASSWORD_POLICY_REGEX, 'Contraseña débil: mínimo 8 caracteres con mayúscula, minúscula, número y símbolo.'),
      rolId: z.coerce.number().int().positive(),
      empresaId: z.coerce.number().int().positive().nullable().optional(),
      cargo: z.string().max(120).optional(),
      area: z.string().max(120).optional(),
      telefono: z.string().max(30).optional(),
      // Solo obligatorios cuando el rol elegido es ESPECIALISTA (se valida
      // en el controlador, tras resolver a qué rol corresponde `rolId`,
      // porque Zod no puede consultar la base de datos durante el parseo).
      especialidad: z.string().min(2).max(120).optional(),
      tarifaBase: z.coerce.number().positive().max(99999999).optional(),
      categoriaId: z.coerce.number().int().positive().optional(),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

const actualizarUsuarioSchema = z.object({
  body: z
    .object({
      nombre: z.string().min(2).max(150).optional(),
      rolId: z.coerce.number().int().positive().optional(),
      empresaId: z.coerce.number().int().positive().nullable().optional(),
      cargo: z.string().max(120).optional(),
      area: z.string().max(120).optional(),
      telefono: z.string().max(30).optional(),
      // El estado se cambia con los endpoints dedicados de activar/inactivar,
      // no desde la edición general (evita que un PUT arbitrario reactive o
      // bloquee una cuenta como efecto secundario no auditado por separado).
    })
    .strict(),
  query: z.any(),
  params: z.object({ id: z.coerce.number().int().positive() }),
});

const include = [
  { model: Rol, attributes: ['id', 'codigo', 'nombre'] },
  { model: Empresa, attributes: ['id', 'nombre'] },
];

async function list(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);

    // Un ADMIN_EMPRESA solo ve/gestiona usuarios de su propia empresa.
    const where = req.user.rol === 'SUPER_ADMIN' ? {} : { empresa_id: req.user.empresaId };

    // Antes: `include` de Rol Y Empresa (ambas con columna `id`) junto con
    // `order:[['id','DESC']]` en la consulta padre — el mismo patrón que ya
    // causó relaciones no pobladas en otros módulos de este proyecto
    // (Rol/Empresa saliendo en blanco de forma intermitente en la grilla).
    // Se separa en consultas independientes + Map, igual que en el resto.
    const { rows: usuarios, count } = await Usuario.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['id', 'DESC']],
    });
    const rolIds = [...new Set(usuarios.map((u) => u.rol_id).filter(Boolean))];
    const empresaIds = [...new Set(usuarios.map((u) => u.empresa_id).filter(Boolean))];
    const [roles, empresas] = await Promise.all([
      rolIds.length ? Rol.findAll({ where: { id: rolIds }, attributes: ['id', 'codigo', 'nombre'] }) : [],
      empresaIds.length ? Empresa.findAll({ where: { id: empresaIds }, attributes: ['id', 'nombre'] }) : [],
    ]);
    const rolPorId = new Map(roles.map((r) => [r.id, r]));
    const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
    const rows = usuarios.map((u) => {
      const plano = u.get({ plain: true });
      return {
        ...plano,
        Rol: plano.rol_id ? rolPorId.get(plano.rol_id) || null : null,
        Empresa: plano.empresa_id ? empresaPorId.get(plano.empresa_id) || null : null,
      };
    });
    res.json({ data: rows, total: count, page, pageSize });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const usuario = await Usuario.findByPk(req.params.id, { include });
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');
    res.json({ data: usuario });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { nombre, email, password, rolId, empresaId, cargo, area, telefono, especialidad, tarifaBase, categoriaId } = req.body;

    const rol = await Rol.findByPk(rolId, { transaction: t });
    if (!rol || !rol.activo) throw new HttpError(400, 'El rol seleccionado no existe o está inactivo.');

    // Autorización por ROL A ASIGNAR, no solo por el permiso genérico
    // "usuarios.crear": sin este chequeo, cualquier ADMIN_EMPRESA con
    // permiso para crear usuarios podría darse a sí mismo (o a un tercero)
    // el rol SUPER_ADMIN — una escalación de privilegios — o dar de alta
    // especialistas del marketplace, que son exclusivos de SUPER_ADMIN.
    if (req.user.rol !== 'SUPER_ADMIN') {
      if (rol.codigo === 'SUPER_ADMIN') {
        throw new HttpError(403, 'No tienes permiso para crear un usuario con rol SUPER_ADMIN.');
      }
      if (rol.codigo === 'ESPECIALISTA') {
        throw new HttpError(403, 'Los especialistas del marketplace solo pueden darse de alta desde la administración global.');
      }
    }

    if (req.user.rol !== 'SUPER_ADMIN' && Number(empresaId) !== Number(req.user.empresaId)) {
      throw new HttpError(403, 'No puedes crear usuarios fuera de tu empresa.');
    }
    // Los especialistas son profesionales independientes del marketplace,
    // no pertenecen a ninguna empresa cliente.
    if (rol.codigo === 'ESPECIALISTA' && empresaId) {
      throw new HttpError(400, 'Un especialista no se asocia a una empresa.');
    }
    if (rol.codigo !== 'ESPECIALISTA' && rol.codigo !== 'SUPER_ADMIN' && !empresaId) {
      throw new HttpError(400, 'Debes indicar la empresa para este rol.');
    }
    if (rol.codigo === 'ESPECIALISTA' && (!especialidad || !tarifaBase)) {
      throw new HttpError(400, 'Para el rol ESPECIALISTA debes indicar especialidad y tarifa base.');
    }

    const password_hash = await hashPassword(password);
    const usuario = await Usuario.create(
      {
        nombre,
        email: email.toLowerCase(),
        password_hash,
        rol_id: rolId,
        empresa_id: rol.codigo === 'ESPECIALISTA' ? null : (empresaId ?? null),
        cargo,
        area,
        telefono,
        estado: 'activo',
        debe_cambiar_pass: true, // fuerza cambio de contraseña en el primer login
        creado_por: req.user.id,
      },
      { transaction: t }
    );

    if (rol.codigo === 'COLABORADOR') {
      await Colaborador.create(
        { usuario_id: usuario.id, empresa_id: empresaId, cargo, area, fecha_ingreso: new Date() },
        { transaction: t }
      );
    } else if (rol.codigo === 'ESPECIALISTA') {
      await Especialista.create(
        {
          usuario_id: usuario.id,
          categoria_id: categoriaId ?? null,
          especialidad,
          tarifa_base: tarifaBase,
          pct_comision: 15.0,
          verificado: false, // requiere verificación manual de un administrador antes de operar
        },
        { transaction: t }
      );
    }

    await t.commit();
    await registrarAuditoria({ req, accion: 'crear_usuario', entidad: 'usuarios', entidadId: usuario.id, detalles: { rol: rol.codigo } });
    const creado = await Usuario.findByPk(usuario.id, { include });

    // El correo NUNCA bloquea ni revierte la creación del usuario (ya
    // confirmada en base de datos): si el SMTP falla, se registra en el
    // log (ver mailer.js) y la respuesta HTTP sigue siendo 201.
    correoBienvenida({ to: creado.email, nombre: creado.nombre, passwordTemporal: password }).catch(() => {});

    res.status(201).json({ data: creado });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

async function update(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const usuario = await Usuario.findByPk(req.params.id, { transaction: t });
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

    if (req.user.rol !== 'SUPER_ADMIN' && Number(usuario.empresa_id) !== Number(req.user.empresaId)) {
      throw new HttpError(403, 'No puedes modificar usuarios de otra empresa.');
    }

    // Traducción explícita camelCase (API) -> snake_case (columna real).
    // Nunca se pasa req.body tal cual a Sequelize: además de la conversión
    // de nombres, esto es lo que impide un "mass assignment" de columnas
    // sensibles (password_hash, estado, intentos_fallidos...) que no están
    // en este listado, aunque alguien las cuele en el JSON de la petición.
    const cambiosUsuario = {};
    if (req.body.nombre !== undefined) cambiosUsuario.nombre = req.body.nombre;
    if (req.body.cargo !== undefined) cambiosUsuario.cargo = req.body.cargo;
    if (req.body.area !== undefined) cambiosUsuario.area = req.body.area;
    if (req.body.telefono !== undefined) cambiosUsuario.telefono = req.body.telefono;

    if (req.body.rolId !== undefined) {
      const nuevoRol = await Rol.findByPk(req.body.rolId, { transaction: t });
      if (!nuevoRol || !nuevoRol.activo) throw new HttpError(400, 'El rol seleccionado no existe o está inactivo.');

      // Mismo control de escalación de privilegios que en create(): un
      // ADMIN_EMPRESA no puede ascender a nadie a SUPER_ADMIN ni convertir
      // a un colaborador en ESPECIALISTA del marketplace por esta vía.
      if (req.user.rol !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'ESPECIALISTA'].includes(nuevoRol.codigo)) {
        throw new HttpError(403, `No tienes permiso para asignar el rol ${nuevoRol.codigo}.`);
      }
      cambiosUsuario.rol_id = req.body.rolId;
    }

    // Reasignar la empresa de un usuario es una operación multi-tenant
    // sensible (mueve a la persona y su historial de una organización a
    // otra): solo SUPER_ADMIN puede hacerlo. Un ADMIN_EMPRESA que intente
    // colar `empresaId` en el body simplemente no tiene efecto.
    if (req.body.empresaId !== undefined && req.user.rol === 'SUPER_ADMIN') {
      cambiosUsuario.empresa_id = req.body.empresaId;
    }

    await usuario.update(cambiosUsuario, { transaction: t });

    // Si el usuario tiene un perfil de Colaborador vinculado, se mantiene
    // sincronizado cargo/área/empresa para no tener dos "verdades" distintas
    // en `usuarios` y en `colaboradores`.
    const colaborador = await Colaborador.findOne({ where: { usuario_id: usuario.id }, transaction: t });
    if (colaborador) {
      const cambiosColaborador = {};
      if (cambiosUsuario.cargo !== undefined) cambiosColaborador.cargo = cambiosUsuario.cargo;
      if (cambiosUsuario.area !== undefined) cambiosColaborador.area = cambiosUsuario.area;
      if (cambiosUsuario.empresa_id !== undefined) cambiosColaborador.empresa_id = cambiosUsuario.empresa_id;
      if (Object.keys(cambiosColaborador).length) await colaborador.update(cambiosColaborador, { transaction: t });
    }

    await t.commit();
    await registrarAuditoria({ req, accion: 'actualizar_usuario', entidad: 'usuarios', entidadId: usuario.id, detalles: cambiosUsuario });
    const actualizado = await Usuario.findByPk(usuario.id, { include });
    res.json({ data: actualizado });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// Nunca se borra un usuario físicamente (perdería la trazabilidad de quién
// hizo qué en citas, evaluaciones, auditoría...). Se INACTIVA: pierde acceso
// inmediato (se revocan todas sus sesiones) pero su historial permanece
// íntegro y es reversible con un clic desde "Activar".
async function inactivar(req, res, next) {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');
    if (usuario.id === req.user.id) throw new HttpError(400, 'No puedes inactivar tu propia cuenta.');

    if (req.user.rol !== 'SUPER_ADMIN' && Number(usuario.empresa_id) !== Number(req.user.empresaId)) {
      throw new HttpError(403, 'No puedes inactivar usuarios de otra empresa.');
    }

    usuario.estado = 'inactivo';
    await usuario.save();
    await logoutAll(usuario.id);

    await registrarAuditoria({ req, accion: 'inactivar_usuario', entidad: 'usuarios', entidadId: usuario.id });
    res.json({ data: usuario });
  } catch (err) {
    next(err);
  }
}

async function activar(req, res, next) {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

    if (req.user.rol !== 'SUPER_ADMIN' && Number(usuario.empresa_id) !== Number(req.user.empresaId)) {
      throw new HttpError(403, 'No puedes activar usuarios de otra empresa.');
    }

    usuario.estado = 'activo';
    usuario.intentos_fallidos = 0;
    usuario.bloqueado_hasta = null;
    await usuario.save();

    await registrarAuditoria({ req, accion: 'activar_usuario', entidad: 'usuarios', entidadId: usuario.id });
    res.json({ data: usuario });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const usuario = await Usuario.scope('conAuth').findByPk(req.params.id);
    if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

    if (req.user.rol !== 'SUPER_ADMIN' && Number(usuario.empresa_id) !== Number(req.user.empresaId)) {
      throw new HttpError(403, 'No puedes resetear la contraseña de un usuario de otra empresa.');
    }

    // Genera una contraseña temporal segura y la envía por correo (ver
    // utils/mailer.js). Se sigue devolviendo también en la respuesta HTTP
    // como respaldo inmediato para el administrador (útil si el usuario no
    // tiene acceso a su correo en ese momento, ej. cuenta recién creada).
    const temporal = require('crypto').randomBytes(9).toString('base64url') + 'Aa1!';
    usuario.password_hash = await hashPassword(temporal);
    usuario.debe_cambiar_pass = true;
    await usuario.save();
    await logoutAll(usuario.id);
    correoPasswordTemporal({ to: usuario.email, nombre: usuario.nombre, passwordTemporal: temporal }).catch(() => {});
    await registrarAuditoria({ req, accion: 'reset_password', entidad: 'usuarios', entidadId: usuario.id });

    res.json({ mensaje: 'Contraseña temporal generada.', passwordTemporal: temporal });
  } catch (err) {
    next(err);
  }
}

const exportColumns = [
  { header: 'ID', key: 'id' },
  { header: 'Nombre', key: 'nombre' },
  { header: 'Email', key: 'email' },
  { header: 'Cargo', key: 'cargo' },
  { header: 'Área', key: 'area' },
  { header: 'Teléfono', key: 'telefono' },
  { header: 'Estado', key: 'estado' },
  { header: 'Último login', key: 'ultimo_login_at' },
];

async function exportData(req, res, next) {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const where = req.user.rol === 'SUPER_ADMIN' ? {} : { empresa_id: req.user.empresaId };
    const rows = (await Usuario.findAll({ where, include })).map((u) => u.get({ plain: true }));

    await registrarAuditoria({ req, accion: 'exportar_usuarios', entidad: 'usuarios', detalles: { formato: format, total: rows.length } });

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, exportColumns, 'Usuarios');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="usuarios.xlsx"');
      return res.send(buffer);
    }
    const csv = toCsv(rows, exportColumns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="usuarios.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  inactivar,
  activar,
  resetPassword,
  exportData,
  crearUsuarioSchema,
  actualizarUsuarioSchema,
};
