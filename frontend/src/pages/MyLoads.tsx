import { useEffect, useState } from 'react';
import { listMyLoads, type LoadSummary } from '../services/apiClient';
import { t } from '../i18n/es-MX';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';

export function MyLoads() {
  const [loads, setLoads] = useState<LoadSummary[] | null>(null);

  useEffect(() => {
    void listMyLoads().then(setLoads).catch(() => setLoads([]));
  }, []);

  if (loads === null) return <p className="muted">{t.common.loading}</p>;

  return (
    <section className="stack" style={{ gap: '1rem' }}>
      <h2>{t.loads.title}</h2>
      {loads.length === 0 ? (
        <div className="card"><div className="card-body muted">{t.loads.empty}</div></div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t.loads.id}</th>
              <th>{t.loads.status}</th>
              <th>{t.loads.total}</th>
              <th>{t.loads.valid}</th>
              <th>{t.loads.rejected}</th>
              <th>{t.loads.date}</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.loadId}>
                <td className="mono">{l.loadId.slice(0, 8)}</td>
                <td><StatusBadge status={l.status} /></td>
                <td>{l.totalRows}</td>
                <td>{l.validRows}</td>
                <td>{l.rejectedRows}</td>
                <td>{new Date(l.createdAt).toLocaleString('es-MX')}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
