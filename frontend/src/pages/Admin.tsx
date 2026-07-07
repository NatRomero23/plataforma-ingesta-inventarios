import { useEffect, useState } from 'react';
import { admin, type ApiKeyInfo, type Chain, type Pharmacy } from '../services/apiClient';
import { t } from '../i18n/es-MX';
import { Card } from '../components/Card';
import { Table } from '../components/Table';

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
    <section className="stack" style={{ gap: '1rem' }}>
      <h2>{t.admin.title}</h2>
      {error && <p className="alert alert-error">{error}</p>}

      <ChainsSection chains={chains} onCreated={refreshChains} />

      <Card title={t.admin.selectChain}>
        <label className="field" style={{ maxWidth: 320 }}>
          <span>{t.admin.selectChain}</span>
          <select value={selectedChain} onChange={(e) => setSelectedChain(e.target.value)}>
            <option value="">—</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </Card>

      {selectedChain && (
        <>
          <PharmaciesSection chainId={selectedChain} />
          <ApiKeysSection chainId={selectedChain} />
        </>
      )}

      <UsersSection chains={chains} />
    </section>
  );
}

function ChainsSection({ chains, onCreated }: { chains: Chain[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title={t.admin.chains}>
      {chains.length > 0 && (
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          {chains.map((c) => (
            <span key={c.id} className="badge badge-neutral">{c.name}</span>
          ))}
        </div>
      )}
      <div className="row row-end">
        <label className="field">
          <span>{t.admin.chainName}</span>
          <input placeholder={t.admin.chainName} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
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
      </div>
      {err && <p className="alert alert-error">{err}</p>}
    </Card>
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
    <Card title={t.admin.pharmacies}>
      <Table>
        <thead>
          <tr>
            <th>{t.admin.internalCode}</th>
            <th>{t.admin.redVidarCode}</th>
            <th>{t.admin.pharmacyName}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.chainInternalCode}</td>
              <td>
                {p.redVidarPharmacyCode ? (
                  <span className="mono">{p.redVidarPharmacyCode}</span>
                ) : (
                  <span className="badge badge-warn">{t.activity.unmapped}</span>
                )}
              </td>
              <td>{p.name}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="row row-end" style={{ marginTop: '0.75rem' }}>
        <label className="field">
          <span>{t.admin.internalCode}</span>
          <input placeholder={t.admin.internalCode} value={form.chainInternalCode} onChange={(e) => setForm({ ...form, chainInternalCode: e.target.value })} />
        </label>
        <label className="field">
          <span>{t.admin.redVidarCode}</span>
          <input placeholder={t.admin.redVidarCode} value={form.redVidarPharmacyCode} onChange={(e) => setForm({ ...form, redVidarPharmacyCode: e.target.value })} />
        </label>
        <label className="field">
          <span>{t.admin.pharmacyName}</span>
          <input placeholder={t.admin.pharmacyName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
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
      {err && <p className="alert alert-error">{err}</p>}
    </Card>
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
    <Card
      title={t.admin.apiKeys}
      actions={
        <button
          onClick={async () => {
            const res = await admin.generateApiKey(chainId);
            setSecret(res.apiKey);
            await refresh();
          }}
        >
          {t.admin.generateKey}
        </button>
      }
    >
      <p className="muted text-sm" style={{ marginTop: 0 }}>{t.admin.autoRevokeNote}</p>
      {secret && (
        <p className="alert alert-info">
          {t.admin.keyOnce} <code className="mono">{secret}</code>
        </p>
      )}
      <Table>
        <thead>
          <tr>
            <th>Clave</th>
            <th>{t.admin.status}</th>
            <th>{t.admin.created}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}>
              <td className="mono">****{k.last4}</td>
              <td>
                <span className={`badge ${k.status === 'ACTIVE' ? 'badge-ok' : 'badge-neutral'}`}>{k.status}</span>
              </td>
              <td>{new Date(k.createdAt).toLocaleString('es-MX')}</td>
              <td>
                {k.status === 'ACTIVE' && (
                  <button
                    className="btn-sm btn-danger"
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
      </Table>
    </Card>
  );
}

function UsersSection({ chains }: { chains: Chain[] }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'COORDINATOR', chainId: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card title={t.admin.users}>
      <div className="row row-end">
        <label className="field">
          <span>{t.admin.email}</span>
          <input placeholder={t.admin.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">
          <span>{t.admin.password}</span>
          <input type="password" placeholder={t.admin.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <label className="field">
          <span>{t.admin.role}</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="ADMIN">ADMIN</option>
            <option value="COORDINATOR">COORDINATOR</option>
            <option value="PHARMACY_USER">PHARMACY_USER</option>
          </select>
        </label>
        <label className="field">
          <span>{t.admin.assignedChain}</span>
          <select value={form.chainId} onChange={(e) => setForm({ ...form, chainId: e.target.value })}>
            <option value="">{t.admin.assignedChain}</option>
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
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
      {msg && <p className="alert alert-success">{msg}</p>}
      {err && <p className="alert alert-error">{err}</p>}
    </Card>
  );
}
