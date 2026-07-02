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
      setSession(token, role);
      navigate(role === 'ADMIN' || role === 'COORDINATOR' ? '/buzon' : '/subir');
    } catch {
      setError(t.login.error);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>{t.appName}</h1>
      <h2>{t.login.title}</h2>
      <form onSubmit={onSubmit}>
        <label>
          {t.login.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%' }} />
        </label>
        <label>
          {t.login.password}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%' }}
          />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" style={{ marginTop: '1rem' }}>
          {t.login.submit}
        </button>
      </form>
    </main>
  );
}
