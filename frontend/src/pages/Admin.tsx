import { useEffect, useState, type CSSProperties } from 'react';
import { admin, type ApiKeyInfo, type Chain, type Pharmacy } from '../services/apiClient';
import { t } from '../i18n/es-MX';

export function Admin() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedChain, setSelectedChain] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function refreshChains() {
    try {
      setChains(await admin.listChains());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refreshChains();
  }, []);

  return (
    <section>
      <h2>{t.admin.title}</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <ChainsSection chains={chains} onCreated={refreshChains} />

      <hr />
      <label>
        {t.admin.selectChain}{' '}
        <select value={selectedChain} onChange={(e) => setSelectedChain(e.target.value)}>
          <option value="">—</option>
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {selectedChain && (
        <>
          <PharmaciesSection chainId={selectedChain} />
          <ApiKeysSection chainId={selectedChain} />
        </>
      )}

      <hr />
      <UsersSection chains={chains} />
    </section>
  );
}

function ChainsSection({ chains, onCreated }: { chains: Chain[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <h3>{t.admin.chains}</h3>
      <ul>
        {chains.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
      <input placeholder={t.admin.chainName} value={name} onChange={(e) => setName(e.target.value)} />
      <button
        onClick={async () => {
          setErr(null);
          try {
            await admin.createChain(name);
            setName('');
            onCreated();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {t.admin.newChain}
      </button>
      {err && <span style={{ color: 'crimson' }}> {err}</span>}
    </div>
  );
}

function PharmaciesSection({ chainId }: { chainId: string }) {
  const [items, setItems] = useState<Pharmacy[]>([]);
  const [form, setForm] = useState({ chainInternalCode: '', redVidarPharmacyCode: '', name: '' });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setItems(await admin.listPharmacies(chainId));
  }
  useEffect(() => {
    void refresh();
  }, [chainId]);

  return (
    <div>
      <h3>{t.admin.pharmacies}</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>{t.admin.internalCode}</th>
            <th style={cell}>{t.admin.redVidarCode}</th>
            <th style={cell}>{t.admin.pharmacyName}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td style={cell}>{p.chainInternalCode}</td>
              <td style={cell}>{p.redVidarPharmacyCode ?? '— (no mapeada)'}</td>
              <td style={cell}>{p.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <input placeholder={t.admin.internalCode} value={form.chainInternalCode} onChange={(e) => setForm({ ...form, chainInternalCode: e.target.value })} />
        <input placeholder={t.admin.redVidarCode} value={form.redVidarPharmacyCode} onChange={(e) => setForm({ ...form, redVidarPharmacyCode: e.target.value })} />
        <input placeholder={t.admin.pharmacyName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <button
          onClick={async () => {
            setErr(null);
            try {
              await admin.createPharmacy(chainId, {
                chainInternalCode: form.chainInternalCode,
                redVidarPharmacyCode: form.redVidarPharmacyCode || null,
                name: form.name,
              });
              setForm({ chainInternalCode: '', redVidarPharmacyCode: '', name: '' });
              await refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          {t.admin.addPharmacy}
        </button>
      </div>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </div>
  );
}

function ApiKeysSection({ chainId }: { chainId: string }) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [secret, setSecret] = useState<string | null>(null);

  async function refresh() {
    setKeys(await admin.listApiKeys(chainId));
  }
  useEffect(() => {
    void refresh();
  }, [chainId]);

  return (
    <div>
      <h3>{t.admin.apiKeys}</h3>
      <p style={{ fontSize: '0.85rem', color: '#555' }}>{t.admin.autoRevokeNote}</p>
      {secret && (
        <p style={{ background: '#fffae6', padding: '0.5rem' }}>
          {t.admin.keyOnce} <code>{secret}</code>
        </p>
      )}
      <button
        onClick={async () => {
          const res = await admin.generateApiKey(chainId);
          setSecret(res.apiKey);
          await refresh();
        }}
      >
        {t.admin.generateKey}
      </button>
      <table style={{ borderCollapse: 'collapse', marginTop: '0.5rem' }}>
        <thead>
          <tr>
            <th style={cell}>Clave</th>
            <th style={cell}>{t.admin.status}</th>
            <th style={cell}>{t.admin.created}</th>
            <th style={cell}></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}>
              <td style={cell}>****{k.last4}</td>
              <td style={cell}>{k.status}</td>
              <td style={cell}>{new Date(k.createdAt).toLocaleString('es-MX')}</td>
              <td style={cell}>
                {k.status === 'ACTIVE' && (
                  <button
                    onClick={async () => {
                      await admin.revokeApiKey(k.id);
                      await refresh();
                    }}
                  >
                    {t.admin.revoke}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersSection({ chains }: { chains: Chain[] }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'COORDINATOR', chainId: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <h3>{t.admin.users}</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input placeholder={t.admin.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder={t.admin.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="ADMIN">ADMIN</option>
          <option value="COORDINATOR">COORDINATOR</option>
          <option value="PHARMACY_USER">PHARMACY_USER</option>
        </select>
        <select value={form.chainId} onChange={(e) => setForm({ ...form, chainId: e.target.value })}>
          <option value="">{t.admin.assignedChain}</option>
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={async () => {
            setErr(null);
            setMsg(null);
            try {
              await admin.createUser({
                email: form.email,
                password: form.password,
                role: form.role,
                chainId: form.chainId || null,
              });
              setMsg('Usuario creado.');
              setForm({ email: '', password: '', role: 'COORDINATOR', chainId: '' });
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          {t.admin.createUser}
        </button>
      </div>
      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </div>
  );
}

const cell: CSSProperties = { border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' };
