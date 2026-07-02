import { Navigate, Outlet, Link, useNavigate } from 'react-router-dom';
import { clearToken, getToken, getRole, isPrivileged } from './services/apiClient';
import { t } from './i18n/es-MX';

/** Layout con navegación para las rutas protegidas del portal. */
export function PortalLayout() {
  const navigate = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;
  const privileged = isPrivileged();
  const isAdmin = getRole() === 'ADMIN';

  function logout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 900, margin: '2rem auto' }}>
      <header style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem' }}>
        <strong>{t.appName}</strong>
        <nav style={{ display: 'flex', gap: '1rem', flex: 1 }}>
          {privileged ? (
            <>
              <Link to="/buzon">{t.nav.mailbox}</Link>
              <Link to="/actividad">{t.nav.activity}</Link>
              {isAdmin && <Link to="/admin">{t.nav.admin}</Link>}
            </>
          ) : (
            <>
              <Link to="/subir">{t.nav.upload}</Link>
              <Link to="/mis-cargas">{t.nav.myLoads}</Link>
            </>
          )}
        </nav>
        <button onClick={logout}>{t.nav.logout}</button>
      </header>
      <main style={{ marginTop: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
