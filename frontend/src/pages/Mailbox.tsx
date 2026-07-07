import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listLoads, type LoadFilters, type LoadSummary } from '../services/apiClient';
import { t } from '../i18n/es-MX';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';

const STATUSES = [
  'RECEIVED',
  'VALIDATED',
  'QUEUED',
  'SENT',
  'CONFIRMED',
  'CONFIRMED_WITH_ERRORS',
  'FAILED',
];

export function Mailbox() {
  const [filters, setFilters] = useState<LoadFilters>({});
  const [loads, setLoads] = useState<LoadSummary[] | null>(null);

  async function load(applied: LoadFilters) {
    setLoads(null);
    try {
      setLoads(await listLoads(applied));
    } catch {
      setLoads([]);
    }
  }

  useEffect(() => {
    void load({});
  }, []);

  function set<K extends keyof LoadFilters>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <section className="stack" style={{ gap: '1rem' }}>
      <h2>{t.mailbox.title}</h2>

      <div className="card">
        <div className="card-body">
          <div className="filter-bar">
            <label className="field">
              <span>{t.mailbox.chain}</span>
              <input value={filters.chainId ?? ''} onChange={(e) => set('chainId', e.target.value)} />
            </label>
            <label className="field">
              <span>{t.mailbox.pharmacy}</span>
              <input value={filters.pharmacyCode ?? ''} onChange={(e) => set('pharmacyCode', e.target.value)} />
            </label>
            <label className="field">
              <span>{t.mailbox.status}</span>
              <select value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
                <option value="">{t.mailbox.all}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.status[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.mailbox.dateFrom}</span>
              <input type="date" value={filters.dateFrom ?? ''} onChange={(e) => set('dateFrom', e.target.value)} />
            </label>
            <label className="field">
              <span>{t.mailbox.dateTo}</span>
              <input type="date" value={filters.dateTo ?? ''} onChange={(e) => set('dateTo', e.target.value)} />
            </label>
            <div className="filter-actions">
              <button onClick={() => void load(filters)}>{t.mailbox.apply}</button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setFilters({});
                  void load({});
                }}
              >
                {t.mailbox.clear}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loads === null ? (
        <p className="muted">{t.common.loading}</p>
      ) : loads.length === 0 ? (
        <div className="card"><div className="card-body muted">{t.mailbox.empty}</div></div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t.loads.id}</th>
              <th>{t.mailbox.origin}</th>
              <th>{t.mailbox.status}</th>
              <th>{t.loads.total}</th>
              <th>{t.loads.valid}</th>
              <th>{t.loads.rejected}</th>
              <th>{t.loads.date}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.loadId}>
                <td className="mono">{l.loadId.slice(0, 8)}</td>
                <td>{l.origin}</td>
                <td><StatusBadge status={l.status} /></td>
                <td>{l.totalRows}</td>
                <td>{l.validRows}</td>
                <td>{l.rejectedRows}</td>
                <td>{new Date(l.createdAt).toLocaleString('es-MX')}</td>
                <td>
                  <Link to={`/carga/${l.loadId}`}>{t.mailbox.viewDetail}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
