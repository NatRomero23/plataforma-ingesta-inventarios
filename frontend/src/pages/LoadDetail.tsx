import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLoadDetail, downloadOriginal, type LoadDetail as Detail } from '../services/apiClient';
import { t } from '../i18n/es-MX';

export function LoadDetail() {
  const { loadId } = useParams<{ loadId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadId) return;
    void getLoadDetail(loadId)
      .then(setDetail)
      .catch(() => setError('No se pudo cargar el detalle.'));
  }, [loadId]);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!detail) return <p>Cargando…</p>;

  return (
    <section>
      <p>
        <Link to="/buzon">{t.detail.back}</Link>
      </p>
      <h2>
        {t.detail.title} — {t.status[detail.status] ?? detail.status}
      </h2>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem' }}>
        <dt>{t.detail.origin}</dt>
        <dd>{detail.origin}</dd>
        <dt>{t.detail.uploadedBy}</dt>
        <dd>{detail.uploadedBy ?? '—'}</dd>
        <dt>{t.detail.createdAt}</dt>
        <dd>{new Date(detail.createdAt).toLocaleString('es-MX')}</dd>
      </dl>

      <p>
        {t.detail.total}: <strong>{detail.totalRows}</strong> · {t.detail.valid}:{' '}
        <strong>{detail.validRows}</strong> · {t.detail.rejected}: <strong>{detail.rejectedRows}</strong> ·{' '}
        {t.detail.unmapped}: <strong>{detail.unmappedPharmacyCount}</strong>
      </p>

      <button onClick={() => void downloadOriginal(detail.loadId, detail.originalFilename)}>
        {t.detail.downloadOriginal}
      </button>

      {detail.rejectedDetail.length > 0 && (
        <>
          <h3>{t.detail.rejectedTitle}</h3>
          <ul>
            {detail.rejectedDetail.map((r) => (
              <li key={r.rowNumber}>
                Fila {r.rowNumber}: {r.reason}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>{t.detail.attemptsTitle}</h3>
      {detail.attempts.length === 0 ? (
        <p>—</p>
      ) : (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>{t.detail.attempt}</th>
              <th style={cell}>{t.detail.httpStatus}</th>
              <th style={cell}>{t.detail.event}</th>
              <th style={cell}>{t.loads.date}</th>
              <th style={cell}>{t.detail.error}</th>
            </tr>
          </thead>
          <tbody>
            {detail.attempts.map((a) => (
              <tr key={a.attemptNumber}>
                <td style={cell}>{a.attemptNumber}</td>
                <td style={cell}>{a.httpStatus ?? '—'}</td>
                <td style={cell}>{a.webhookEventId ?? '—'}</td>
                <td style={cell}>{a.finishedAt ? new Date(a.finishedAt).toLocaleString('es-MX') : '—'}</td>
                <td style={cell}>{a.errorReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{t.detail.resultTitle}</h3>
      {detail.redVidarResult ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem' }}>
          <dt>{t.detail.event}</dt>
          <dd>{detail.redVidarResult.webhookEventId}</dd>
          <dt>{t.detail.entriesInserted}</dt>
          <dd>{detail.redVidarResult.entriesInserted ?? '—'}</dd>
          <dt>{t.detail.medsInserted}</dt>
          <dd>{detail.redVidarResult.medicationsInserted ?? '—'}</dd>
          <dt>{t.detail.medsUpdated}</dt>
          <dd>{detail.redVidarResult.medicationsUpdated ?? '—'}</dd>
          <dt>{t.detail.unknownCodes}</dt>
          <dd>{detail.redVidarResult.unknownPharmacyCodes.join(', ') || '—'}</dd>
        </dl>
      ) : (
        <p>{t.detail.noResult}</p>
      )}
    </section>
  );
}

const cell: CSSProperties = { border: '1px solid #ddd', padding: '0.4rem', textAlign: 'left' };
