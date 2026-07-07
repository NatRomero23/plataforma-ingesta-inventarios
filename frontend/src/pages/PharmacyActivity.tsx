import { useEffect, useState } from 'react';
import { listPharmacyActivity, type PharmacyActivity as Activity } from '../services/apiClient';
import { t } from '../i18n/es-MX';
import { Table } from '../components/Table';

export function PharmacyActivity() {
  const [rows, setRows] = useState<Activity[] | null>(null);

  useEffect(() => {
    void listPharmacyActivity()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <p className="muted">{t.common.loading}</p>;

  return (
    <section className="stack" style={{ gap: '1rem' }}>
      <h2>{t.activity.title}</h2>
      <Table>
        <thead>
          <tr>
            <th>{t.activity.pharmacy}</th>
            <th>{t.activity.internalCode}</th>
            <th>{t.activity.redVidarCode}</th>
            <th>{t.activity.lastSuccess}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stale = !r.lastSuccessfulLoadAt;
            return (
              <tr key={r.pharmacyId} className={stale ? 'row-alert' : undefined}>
                <td>{r.name}</td>
                <td className="mono">{r.chainInternalCode}</td>
                <td>
                  {r.redVidarPharmacyCode ? (
                    <span className="mono">{r.redVidarPharmacyCode}</span>
                  ) : (
                    <span className="badge badge-warn">{t.activity.unmapped}</span>
                  )}
                </td>
                <td>
                  {r.lastSuccessfulLoadAt ? (
                    new Date(r.lastSuccessfulLoadAt).toLocaleString('es-MX')
                  ) : (
                    <span className="badge badge-danger">{t.activity.never}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}
