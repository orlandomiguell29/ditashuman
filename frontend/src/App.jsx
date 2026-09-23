import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import CuentaSeguridad from './pages/cuenta/Seguridad';
import { useAuth } from './context/AuthContext';

import ColaboradorHome from './pages/colaborador/Home';
import ColaboradorCategorias from './pages/colaborador/Categorias';
import ColaboradorAgenda from './pages/colaborador/Agenda';
import ColaboradorAcademia from './pages/colaborador/Academia';
import ColaboradorExpediente from './pages/colaborador/Expediente';
import ColaboradorProgreso from './pages/colaborador/Progreso';
import ColaboradorClima from './pages/colaborador/Clima';

import EmpresaDashboard from './pages/empresa/Dashboard';
import EmpresaColaboradores from './pages/empresa/Colaboradores';
import EmpresaEvaluaciones from './pages/empresa/Evaluaciones';
import EmpresaOkrs from './pages/empresa/Okrs';
import EmpresaClima from './pages/empresa/Clima';

import EspecialistaDashboard from './pages/especialista/Dashboard';
import EspecialistaAgenda from './pages/especialista/Agenda';
import EspecialistaIngresos from './pages/especialista/Ingresos';

import AdminDashboard from './pages/admin/Dashboard';
import AdminUsuarios from './pages/admin/Usuarios';
import AdminRoles from './pages/admin/Roles';
import AdminPermisos from './pages/admin/Permisos';
import AdminEmpresas from './pages/admin/Empresas';
import AdminCategorias from './pages/admin/Categorias';
import AdminCursos from './pages/admin/Cursos';
import AdminCompetencias from './pages/admin/Competencias';
import AdminEspecialistas from './pages/admin/Especialistas';
import AdminComisiones from './pages/admin/Comisiones';
import AdminIntegraciones from './pages/admin/Integraciones';
import AdminAuditoria from './pages/admin/Auditoria';

function InicioPorRol() {
  const { usuario } = useAuth();
  const destinos = {
    COLABORADOR: '/colaborador/inicio',
    ADMIN_EMPRESA: '/empresa/dashboard',
    ESPECIALISTA: '/especialista/dashboard',
    SUPER_ADMIN: '/admin/dashboard',
  };
  return <Navigate to={destinos[usuario?.rol] || '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/olvide-password" element={<ForgotPassword />} />
      <Route path="/restablecer-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<InicioPorRol />} />
          <Route path="/cuenta/seguridad" element={<CuentaSeguridad />} />

          <Route path="/colaborador/inicio" element={<ColaboradorHome />} />
          <Route path="/colaborador/categorias" element={<ColaboradorCategorias />} />
          <Route path="/colaborador/agenda" element={<ColaboradorAgenda />} />
          <Route path="/colaborador/academia" element={<ColaboradorAcademia />} />
          <Route path="/colaborador/clima" element={<ColaboradorClima />} />
          <Route path="/colaborador/expediente" element={<ColaboradorExpediente />} />
          <Route path="/colaborador/progreso" element={<ColaboradorProgreso />} />

          <Route element={<ProtectedRoute rolesPermitidos={['ADMIN_EMPRESA', 'SUPER_ADMIN']} />}>
            <Route path="/empresa/dashboard" element={<EmpresaDashboard />} />
            <Route path="/empresa/colaboradores" element={<EmpresaColaboradores />} />
            <Route path="/empresa/evaluaciones" element={<EmpresaEvaluaciones />} />
            <Route path="/empresa/okrs" element={<EmpresaOkrs />} />
            <Route path="/empresa/clima" element={<EmpresaClima />} />
          </Route>

          <Route element={<ProtectedRoute rolesPermitidos={['ESPECIALISTA']} />}>
            <Route path="/especialista/dashboard" element={<EspecialistaDashboard />} />
            <Route path="/especialista/agenda" element={<EspecialistaAgenda />} />
            <Route path="/especialista/ingresos" element={<EspecialistaIngresos />} />
          </Route>

          {/* Administración compartida por SUPER_ADMIN y ADMIN_EMPRESA (RRHH):
              la protección visible aquí es solo UX — el backend vuelve a
              validar el permiso exacto en cada endpoint (ver PermissionGate
              dentro de cada página para ocultar botones de acciones puntuales). */}
          <Route element={<ProtectedRoute rolesPermitidos={['SUPER_ADMIN', 'ADMIN_EMPRESA']} />}>
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route path="/admin/roles" element={<AdminRoles />} />
            <Route path="/admin/permisos" element={<AdminPermisos />} />
            <Route path="/admin/categorias" element={<AdminCategorias />} />
            <Route path="/admin/cursos" element={<AdminCursos />} />
            <Route path="/admin/competencias" element={<AdminCompetencias />} />
            <Route path="/admin/especialistas" element={<AdminEspecialistas />} />
          </Route>

          {/* Solo SUPER_ADMIN administra el conjunto de empresas cliente
              (multi-tenant): un ADMIN_EMPRESA no debe ver ni crear otras
              empresas, ni siquiera la suya propia (la crea SUPER_ADMIN). */}
          <Route element={<ProtectedRoute rolesPermitidos={['SUPER_ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/empresas" element={<AdminEmpresas />} />
            <Route path="/admin/comisiones" element={<AdminComisiones />} />
            <Route path="/admin/integraciones" element={<AdminIntegraciones />} />
            <Route path="/admin/auditoria" element={<AdminAuditoria />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
