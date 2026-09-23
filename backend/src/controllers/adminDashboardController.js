const { Op } = require('sequelize');
const { Empresa, Usuario, Especialista, Cita, Comision } = require('../models');

// Página de inicio del SUPER_ADMIN: antes entraba directo a "Usuarios" (una
// tabla de gestión, no un panorama de la plataforma). Da un vistazo
// general — empresas, usuarios, especialistas pendientes de verificar,
// actividad de citas, comisiones por liquidar — antes de entrar a
// administrar un módulo puntual.
async function dashboard(req, res, next) {
  try {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    const [
      totalEmpresas,
      totalUsuarios,
      especialistasActivos,
      especialistasPendientes,
      citasDelMes,
      citasCompletadas,
      comisionesPendientes,
    ] = await Promise.all([
      Empresa.count({ where: { activo: true } }),
      Usuario.count({ where: { estado: 'activo' } }),
      Especialista.count({ where: { activo: true, verificado: true } }),
      Especialista.count({ where: { verificado: false } }),
      Cita.count({ where: { fecha_hora: { [Op.gte]: inicioMes } } }),
      Cita.count({ where: { estado: 'completada' } }),
      Comision.count({ where: { estado: 'pendiente' } }),
    ]);

    res.json({
      data: {
        totalEmpresas,
        totalUsuarios,
        especialistasActivos,
        especialistasPendientes,
        citasDelMes,
        citasCompletadas,
        comisionesPendientes,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard };
