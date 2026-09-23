import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';

// El menú se agrupa por secciones para que un rol con muchos módulos (RRHH,
// SUPER_ADMIN) no se vea como una lista plana interminable. Cada entrada es
// solo navegación (UX): el acceso real a cada página y a cada acción dentro
// de ella lo decide siempre el backend según los permisos del usuario.
const MENUS = {
  COLABORADOR: [
    {
      items: [
        { to: '/colaborador/inicio', label: 'Inicio' },
        { to: '/colaborador/categorias', label: 'Hablar con un Experto' },
        { to: '/colaborador/agenda', label: 'Agendar Asesoría' },
        { to: '/colaborador/academia', label: 'Academia Virtual' },
        { to: '/colaborador/clima', label: 'Encuestas de Clima' },
        { to: '/colaborador/progreso', label: 'Mi Progreso' },
        { to: '/colaborador/expediente', label: 'Mi Expediente' },
      ],
    },
  ],
  ESPECIALISTA: [
    {
      items: [
        { to: '/especialista/dashboard', label: 'Dashboard' },
        { to: '/especialista/agenda', label: 'Mi Agenda y Horarios' },
        { to: '/especialista/ingresos', label: 'Historial de Cuentas' },
      ],
    },
  ],
  ADMIN_EMPRESA: [
    {
      titulo: 'Mi empresa',
      items: [
        { to: '/empresa/dashboard', label: 'Dashboard RRHH' },
        { to: '/empresa/colaboradores', label: 'Colaboradores' },
        { to: '/empresa/evaluaciones', label: 'Módulo Desempeño' },
        { to: '/empresa/okrs', label: 'Objetivos del Periodo (OKRs)' },
        { to: '/empresa/clima', label: 'Clima & Encuestas' },
      ],
    },
    {
      titulo: 'Catálogos',
      items: [
        { to: '/admin/categorias', label: 'Categorías de Bienestar' },
        { to: '/admin/cursos', label: 'Cursos (Academia)' },
        { to: '/admin/competencias', label: 'Competencias' },
      ],
    },
    {
      titulo: 'Administración',
      items: [
        { to: '/admin/usuarios', label: 'Usuarios' },
        { to: '/admin/roles', label: 'Roles y Permisos' },
        { to: '/admin/especialistas', label: 'Especialistas (marketplace)' },
      ],
    },
  ],
  SUPER_ADMIN: [
    {
      titulo: 'Plataforma',
      items: [
        { to: '/admin/dashboard', label: 'Inicio' },
        { to: '/admin/empresas', label: 'Empresas Cliente' },
        { to: '/admin/usuarios', label: 'Usuarios' },
        { to: '/admin/roles', label: 'Roles y Permisos' },
        { to: '/admin/especialistas', label: 'Especialistas (marketplace)' },
        { to: '/admin/comisiones', label: 'Comisiones' },
        { to: '/admin/integraciones', label: 'Integraciones (Google Meet)' },
        { to: '/admin/auditoria', label: 'Logs del Sistema' },
      ],
    },
    {
      titulo: 'Catálogos',
      items: [
        { to: '/admin/categorias', label: 'Categorías de Bienestar' },
        { to: '/admin/cursos', label: 'Cursos (Academia)' },
        { to: '/admin/competencias', label: 'Competencias' },
      ],
    },
    {
      titulo: 'Vista de empresa',
      items: [{ to: '/empresa/dashboard', label: 'Ver Dashboard RRHH de una empresa' }],
    },
  ],
};

export default function DashboardLayout() {
  const { usuario, logout } = useAuth();
  const secciones = MENUS[usuario?.rol] || [];
  const location = useLocation();

  // Sidebar off-canvas en pantallas angostas (< 900px, ver global.css): por
  // defecto oculto, se abre con el botón hamburguesa del header y se cierra
  // solo (sin necesidad de tocar la "X") al navegar a otra página o al
  // tocar el fondo oscuro, igual que cualquier menú móvil estándar.
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEffect(() => setMenuAbierto(false), [location.pathname]);

  return (
    <div id="app-container" className={menuAbierto ? 'menu-abierto' : ''}>
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-brand">
            <img src="/assets/logo-mark-transparent.png" alt="" className="logo-mark" />
            <h2>DITASH <span>Human+</span></h2>
          </div>
          <button className="sidebar-cerrar" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)}>×</button>
        </div>
        <nav id="main-nav">
          {secciones.map((seccion, idx) => (
            <div key={idx} className="nav-section">
              {seccion.titulo && <p className="nav-section-title">{seccion.titulo}</p>}
              <ul>
                {seccion.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {menuAbierto && <div className="sidebar-backdrop" onClick={() => setMenuAbierto(false)} />}

      <main className="main-content">
        <header className="top-header">
          <div className="top-header-left">
            <button className="menu-toggle" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>
              <span /><span /><span />
            </button>
            <div>
              <h1>{usuario?.nombre}</h1>
              <p className="subtitle">
                Rol: <strong>{usuario?.rol}</strong>
              </p>
            </div>
          </div>
          <div className="header-actions">
            <div className="user-avatar">{usuario?.nombre?.charAt(0)}</div>
            <span className="header-actions-divider" />
            <Link to="/cuenta/seguridad" className="btn-link">Mi cuenta</Link>
            <button className="btn-link" onClick={logout}>Cerrar sesión</button>
          </div>
        </header>

        <section id="view-viewport">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </section>
      </main>
    </div>
  );
}
