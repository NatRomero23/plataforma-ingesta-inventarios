import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { listLoads, type LoadFilters, type LoadSummary } from '../services/apiClient';
import { t } from '../i18n/es-MX';

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
    <section>
      <h2>{t.mailbox.title}</h2>

      <fieldset style={{ marginBottom: '1rem' }}>
        <legend>{t.mailbox.filters}</legend>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            {t.mailbox.chain}
            <input value={filters.chainId ?? ''} onChange={(e) => set('chainId', e.target.value)} />
          </label>
          <label>
            {t.mailbox.pharmacy}
            <input value={filters.pharmacyCode ?? ''} onChange={(e) => set('pharmacyCode', e.target.value)} />
          </label>
          <label>
            {t.mailbox.status}
            <select value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
              <option value="">{t.mailbox.all}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.status[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.mailbox.dateFrom}
            <input type="date" value={filters.dateFrom ?? ''} onChange={(e) => set('dateFrom', e.target.value)} />
          </label>
          <label>
            {t.mailbox.dateTo}
            <input type="date" value={filters.dateTo ?? ''} onChange={(e) => set('dateTo', e.target.value)} />
          </label>
          <button onClick={() => void load(filters)}>{t.mailbox.apply}</button>
          <button
            onClick={() => {
              setFilters({});
              void load({});
            }}
          >
            {t.mailbox.clear}
          </button>
        </div>
      </fieldset>

      {loads === null ? (
        <p>Cargando…</p>
      ) : loads.length === 0 ? (
        <p>{t.mailbox.empty}</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={cell}>{t.loads.id}</th>
              <th style={cell}>{t.mailbox.origin}</th>
              <th style={cell}>{t.mailbox.status}</th>
              <th style={cell}>{t.loads.total}</th>
              <th style={cell}>{t.loads.valid}</th>
              <th style={cell}>{t.loads.rejected}</th>
              <th style={cell}>{t.loads.date}</th>
              <th style={cell}></th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.loadId}>
                <td style={cell}>{l.loadId.slice(0, 8)}</td>
                <td style={cell}>{l.origin}</td>
                <td style={cell}>{t.status[l.status] ?? l.status}</td>
                <td style={cell}>{l.totalRows}</td>
                <td style={cell}>{l.validRows}</td>
                <td style={cell}>{l.rejectedRows}</td>
                <td style={cell}>{new Date(l.createdAt).toLocaleString('es-MX')}</td>
                <td style={cell}>
                  <Link to={`/carga/${l.loadId}`}>{t.mailbox.viewDetail}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const cell: CSSProperties = { border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' };
