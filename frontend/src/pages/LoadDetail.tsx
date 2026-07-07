import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLoadDetail, downloadOriginal, type LoadDetail as Detail } from '../services/apiClient';
import { t } from '../i18n/es-MX';
import { Card } from '../components/Card';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { CopyField } from '../components/CopyField';

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

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!detail) return <p className="muted">{t.common.loading}</p>;

  return (
    <section className="stack" style={{ gap: '1rem' }}>
      <p style={{ margin: 0 }}>
        <Link to="/buzon">{t.detail.back}</Link>
      </p>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{t.detail.title}</h2>
        <StatusBadge status={detail.status} />
      </div>

      {/* Trazabilidad / origen */}
      <Card
        title={t.detail.origin}
        actions={
          <button className="btn-sm btn-secondary" onClick={() => void downloadOriginal(detail.loadId, detail.originalFilename)}>
            {t.detail.downloadOriginal}
          </button>
        }
      >
        <dl className="detail-dl">
          <dt>{t.detail.origin}</dt>
          <dd>{detail.origin}</dd>
          <dt>{t.detail.uploadedBy}</dt>
          <dd>{detail.uploadedBy ?? '—'}</dd>
          <dt>{t.detail.createdAt}</dt>
          <dd>{new Date(detail.createdAt).toLocaleString('es-MX')}</dd>
          <dt>{t.loads.id}</dt>
          <dd className="mono">{detail.loadId}</dd>
        </dl>
      </Card>

      {/* Conteos como tarjetas numéricas */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{detail.totalRows}</div>
          <div className="stat-label">{t.detail.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value ok">{detail.validRows}</div>
          <div className="stat-label">{t.detail.valid}</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${detail.rejectedRows > 0 ? 'warn' : ''}`}>{detail.rejectedRows}</div>
          <div className="stat-label">{t.detail.rejected}</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${detail.unmappedPharmacyCount > 0 ? 'warn' : ''}`}>{detail.unmappedPharmacyCount}</div>
          <div className="stat-label">{t.detail.unmapped}</div>
        </div>
      </div>

      {detail.rejectedDetail.length > 0 && (
        <Card title={t.detail.rejectedTitle} style={{ borderColor: '#e9c99a' }}>
          <Table>
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Fila</th>
                <th>{t.detail.error}</th>
              </tr>
            </thead>
            <tbody>
              {detail.rejectedDetail.map((r) => (
                <tr key={r.rowNumber}>
                  <td className="mono">{r.rowNumber}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Intentos de envío */}
      <Card title={t.detail.attemptsTitle}>
        {detail.attempts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>—</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t.detail.attempt}</th>
                <th>{t.detail.httpStatus}</th>
                <th>{t.detail.event}</th>
                <th>{t.loads.date}</th>
                <th>{t.detail.error}</th>
              </tr>
            </thead>
            <tbody>
              {detail.attempts.map((a) => (
                <tr key={a.attemptNumber}>
                  <td>{a.attemptNumber}</td>
                  <td>{a.httpStatus ?? '—'}</td>
                  <td className="mono">{a.webhookEventId ?? '—'}</td>
                  <td>{a.finishedAt ? new Date(a.finishedAt).toLocaleString('es-MX') : '—'}</td>
                  <td>{a.errorReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Resultado Red Vidar */}
      <Card title={t.detail.resultTitle}>
        {detail.redVidarResult ? (
          <dl className="detail-dl">
            <dt>{t.detail.event}</dt>
            <dd><CopyField value={detail.redVidarResult.webhookEventId} /></dd>
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
          <p className="muted" style={{ margin: 0 }}>{t.detail.noResult}</p>
        )}
      </Card>
    </section>
  );
}
