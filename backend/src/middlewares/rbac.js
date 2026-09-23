// Control de acceso basado en roles y permisos granulares (RBAC).
// requireAuth debe ejecutarse antes para poblar req.user.permisos.
//
// requirePermission('usuarios.crear') exige exactamente ese permiso.
// SUPER_ADMIN tiene bypass total (rol de sistema, ver seed).
function requirePermission(...codigosRequeridos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (req.user.rol === 'SUPER_ADMIN') return next();

    const tienePermiso = codigosRequeridos.every((c) => req.user.permisos.includes(c));
    if (!tienePermiso) {
      return res.status(403).json({
        error: 'No tienes permisos suficientes para realizar esta acción.',
        requeridos: codigosRequeridos,
      });
    }
    return next();
  };
}

// Multi-tenant: garantiza que un ADMIN_EMPRESA / COLABORADOR / ESPECIALISTA
// solo pueda operar sobre datos de SU propia empresa. SUPER_ADMIN no tiene
// esta restricción (visión global multiempresa).
//
// `getEmpresaIdFromRequest` puede ser sync (devuelve el id) o async
// (devuelve una Promise) — casi siempre hace falta una consulta a la base
// de datos para resolver a qué empresa pertenece el recurso objetivo (ej.
// el colaborador_id recibido en el body), así que el caso async es el uso
// real esperado.
//
// Nota de la auditoría de seguridad: este helper existía desde antes pero
// no se usaba en ninguna ruta — el aislamiento multi-tenant real dependía
// por completo de que cada controlador repitiera a mano el filtro
// `empresa_id` (lo cual sí ocurre en todos los controladores, verificado),
// sin una segunda capa de defensa a nivel de ruta. Se usa por primera vez
// en `colaboradorRoutes.js` (subida de documentos al expediente), que es
// además donde se encontró y corrigió un IDOR real cross-tenant — el lugar
// con más valor para una defensa en profundidad genuina.
function scopedToOwnCompany(getEmpresaIdFromRequest) {
  return async (req, res, next) => {
    try {
      if (req.user.rol === 'SUPER_ADMIN') return next();
      const empresaObjetivo = await getEmpresaIdFromRequest(req);
      if (empresaObjetivo === null || String(empresaObjetivo) !== String(req.user.empresaId)) {
        return res.status(403).json({ error: 'No puedes acceder a datos de otra empresa.' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requirePermission, scopedToOwnCompany };
