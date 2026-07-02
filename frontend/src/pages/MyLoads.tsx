import { useEffect, useState } from 'react';
import { listMyLoads, type LoadSummary } from '../services/apiClient';
import { t } from '../i18n/es-MX';

export function MyLoads() {
  const [loads, setLoads] = useState<LoadSummary[] | null>(null);

  useEffect(() => {
    void listMyLoads().then(setLoads).catch(() => setLoads([]));
  }, []);

  if (loads === null) return <p>Cargando…</p>;
  if (loads.length === 0) return <p>{t.loads.empty}</p>;

  return (
    <section>
      <h2>{t.loads.title}</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cell}>{t.loads.id}</th>
            <th style={cell}>{t.loads.status}</th>
            <th style={cell}>{t.loads.total}</th>
            <th style={cell}>{t.loads.valid}</th>
            <th style={cell}>{t.loads.rejected}</th>
            <th style={cell}>{t.loads.date}</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((l) => (
            <tr key={l.loadId}>
              <td style={cell}>{l.loadId.slice(0, 8)}</td>
              <td style={cell}>{t.status[l.status] ?? l.status}</td>
              <td style={cell}>{l.totalRows}</td>
              <td style={cell}>{l.validRows}</td>
              <td style={cell}>{l.rejectedRows}</td>
              <td style={cell}>{new Date(l.createdAt).toLocaleString('es-MX')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const cell: React.CSSProperties = { border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' };
