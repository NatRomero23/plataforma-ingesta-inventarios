import { useState } from 'react';
import { Navigate, Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { clearToken, getToken, getRole, getUserEmail, isPrivileged } from './services/apiClient';
import { t } from './i18n/es-MX';

/** Íconos minimalistas del sidebar (inline SVG, sin dependencias). */
function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, JSX.Element> = {
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
    loads: <><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></>,
    mailbox: <><path d="M3 7l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></>,
    activity: <><path d="M3 12h4l3 8 4-16 3 8h4" /></>,
    admin: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

const NAV_TITLES: Record<string, string> = {
  '/subir': t.nav.upload,
  '/mis-cargas': t.nav.myLoads,
  '/buzon': t.nav.mailbox,
  '/actividad': t.nav.activity,
  '/admin': t.nav.admin,
};

/** Layout con sidebar fijo para las rutas protegidas del portal. */
export function PortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!getToken()) return <Navigate to="/login" replace />;

  const privileged = isPrivileged();
  const role = getRole() ?? '';
  const isAdmin = role === 'ADMIN';
  const email = getUserEmail();

  function logout() {
    clearToken();
    navigate('/login');
  }

  const links = privileged
    ? [
        { to: '/buzon', label: t.nav.mailbox, icon: 'mailbox' },
        { to: '/actividad', label: t.nav.activity, icon: 'activity' },
        ...(isAdmin ? [{ to: '/admin', label: t.nav.admin, icon: 'admin' }] : []),
      ]
    : [
        { to: '/subir', label: t.nav.upload, icon: 'upload' },
        { to: '/mis-cargas', label: t.nav.myLoads, icon: 'loads' },
      ];

  const pageTitle = NAV_TITLES[location.pathname] ?? (location.pathname.startsWith('/carga/') ? t.detail.title : t.appShort);
  const initial = (email ?? role ?? '?').charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <div
        className={`sidebar-backdrop ${open ? 'show' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-logo" aria-hidden="true">EMA</span>
          <span className="sidebar-brand-name">
            {t.appShort}
            <span className="sidebar-brand-sub">{t.brandSub}</span>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon"><Icon name={l.icon} /></span>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-avatar">{initial}</span>
            <span className="sidebar-user-meta">
              <span className="sidebar-user-name" title={email ?? undefined}>{email ?? t.roles[role] ?? role}</span>
              <span className="sidebar-user-role">{t.roles[role] ?? role}</span>
            </span>
          </div>
          <button className="sidebar-logout" onClick={logout}>{t.nav.logout}</button>
        </div>
      </aside>

      <div className="content-area">
        <header className="navbar">
          <button
            className="nav-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={t.common.menu}
            aria-expanded={open}
          >
            ☰
          </button>
          <span className="navbar-title">{pageTitle}</span>
        </header>
        <main className="content-main">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
