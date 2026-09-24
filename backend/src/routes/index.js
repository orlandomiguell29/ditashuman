const { Router } = require('express');
const { categoriasRouter, cursosRouter, competenciasRouter, tiposEvaluacionRouter } = require('./catalogosRoutes');
const sequelize = require('../config/database');

const router = Router();

router.use('/auth', require('./authRoutes'));
router.use('/auth/mfa', require('./mfaRoutes'));
router.use('/usuarios', require('./usuariosRoutes'));
router.use('/roles', require('./rolesRoutes'));
router.use('/permisos', require('./permisosRoutes'));
router.use('/empresas', require('./empresasRoutes'));
router.use('/categorias', categoriasRouter);
router.use('/cursos', cursosRouter);
router.use('/competencias', competenciasRouter);
router.use('/tipos-evaluacion', tiposEvaluacionRouter);
router.use('/especialistas', require('./especialistasAdminRoutes'));
router.use('/comisiones', require('./comisionesRoutes'));
router.use('/colaborador', require('./colaboradorRoutes'));
router.use('/especialista', require('./especialistaRoutes'));
router.use('/empresa', require('./empresaRoutes'));
router.use('/admin/integraciones', require('./integracionesRoutes'));
router.use('/admin/dashboard', require('./adminDashboardRoutes'));
router.use('/admin/auditoria', require('./auditoriaRoutes'));

// `/health` hace una consulta real a MySQL (no solo responde "ok" desde el
// propio servidor) a propósito: además de confirmar que el backend está
// vivo, esto sirve para mantener "activa" la base de datos de Aiven en su
// plan gratuito — Aiven apaga el servicio automáticamente si no detecta
// actividad, y un monitor externo (ej. UptimeRobot) pegándole a este
// endpoint cada pocos minutos evita ese apagado. Si la consulta falla, se
// responde 503 (no 200) para que el monitor externo SÍ lo detecte como caído.
router.get('/health', async (req, res) => {
  try {
    await sequelize.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable', error: err.message, timestamp: new Date().toISOString() });
  }
});

module.exports = router;
