import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setSession } from '../services/apiClient';
import { t } from '../i18n/es-MX';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { token, role } = await login(email, password);
      setSession(token, role, email);
      navigate(role === 'ADMIN' || role === 'COORDINATOR' ? '/buzon' : '/subir');
    } catch {
      setError(t.login.error);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card card">
        <div className="login-brand">
          <span className="login-logo" aria-hidden="true">EMA</span>
          <div>
            <h1 className="login-app-name">{t.appName}</h1>
            <p className="login-brand-sub">{t.brandSub}</p>
          </div>
        </div>

        <h2 className="login-title">{t.login.title}</h2>
        <p className="login-subtitle muted">{t.login.subtitle}</p>

        <form onSubmit={onSubmit} className="stack" style={{ gap: '1rem', marginTop: '1.25rem' }}>
          <label className="field">
            <span>{t.login.email}</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>{t.login.password}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <button type="submit" className="btn-lg" style={{ width: '100%' }}>
            {t.login.submit}
          </button>
        </form>
      </div>
    </main>
  );
}
