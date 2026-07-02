import { useEffect, useState, type CSSProperties } from 'react';
import { listPharmacyActivity, type PharmacyActivity as Activity } from '../services/apiClient';
import { t } from '../i18n/es-MX';

export function PharmacyActivity() {
  const [rows, setRows] = useState<Activity[] | null>(null);

  useEffect(() => {
    void listPharmacyActivity()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <p>Cargando…</p>;

  return (
    <section>
      <h2>{t.activity.title}</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cell}>{t.activity.pharmacy}</th>
            <th style={cell}>{t.activity.internalCode}</th>
            <th style={cell}>{t.activity.redVidarCode}</th>
            <th style={cell}>{t.activity.lastSuccess}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stale = !r.lastSuccessfulLoadAt;
            return (
              <tr key={r.pharmacyId} style={stale ? { background: '#fff4f4' } : undefined}>
                <td style={cell}>{r.name}</td>
                <td style={cell}>{r.chainInternalCode}</td>
                <td style={cell}>{r.redVidarPharmacyCode ?? t.activity.unmapped}</td>
                <td style={cell}>
                  {r.lastSuccessfulLoadAt ? (
                    new Date(r.lastSuccessfulLoadAt).toLocaleString('es-MX')
                  ) : (
                    <span style={{ color: 'crimson' }}>{t.activity.never}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const cell: CSSProperties = { border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' };
