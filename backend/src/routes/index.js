const { Router } = require('express');
const { categoriasRouter, cursosRouter, competenciasRouter, tiposEvaluacionRouter } = require('./catalogosRoutes');

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

router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
