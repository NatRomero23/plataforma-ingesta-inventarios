import { useRef, useState, type DragEvent } from 'react';
import { downloadTemplate, uploadInventory, confirmLoad, type ValidationSummary } from '../services/apiClient';
import { t } from '../i18n/es-MX';
import { Card } from '../components/Card';
import { Table } from '../components/Table';

export function PortalUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setFile(f);
    setSummary(null);
    setMessage(null);
    setError(null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pick(f);
  }

  async function onValidate() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setSummary(null);
    try {
      setSummary(await uploadInventory(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!summary) return;
    if (summary.validRows === 0) {
      setError(t.upload.noValid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmLoad(summary.loadId);
      setMessage(t.upload.confirmed);
      setSummary(null);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" style={{ gap: '1rem' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>{t.upload.title}</h2>
          <p className="muted text-sm" style={{ margin: 0 }}>{t.upload.intro}</p>
        </div>
        <button className="btn-secondary" onClick={() => void downloadTemplate()}>
          {t.upload.downloadTemplate}
        </button>
      </div>

      <Card>
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <div className="dropzone-icon" aria-hidden="true">⬆</div>
          {file ? (
            <>
              <p className="dropzone-file">{t.upload.fileReady}</p>
              <p className="mono text-sm">{file.name}</p>
              <span className="btn-link">{t.upload.changeFile}</span>
            </>
          ) : (
            <>
              <p className="dropzone-title">{t.upload.dropHint}</p>
              <p className="muted text-sm">{t.upload.dropOr}</p>
            </>
          )}
        </div>

        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="btn-lg" onClick={() => void onValidate()} disabled={!file || busy}>
            {busy ? t.upload.validating : t.upload.validate}
          </button>
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {message && <p className="alert alert-success" role="status">{message}</p>}
      </Card>

      {summary && (
        <section className="stack" style={{ gap: '1rem' }}>
          <h3>{t.upload.summaryTitle}</h3>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value ok">{summary.validRows}</div>
              <div className="stat-label">{t.upload.validRows}</div>
            </div>
            <div className="stat-card">
              <div className={`stat-value ${summary.rejectedRows > 0 ? 'warn' : ''}`}>{summary.rejectedRows}</div>
              <div className="stat-label">{t.upload.rejectedRows}</div>
            </div>
            <div className="stat-card">
              <div className={`stat-value ${summary.unmappedPharmacies.length > 0 ? 'warn' : ''}`}>
                {summary.unmappedPharmacies.length}
              </div>
              <div className="stat-label">{t.upload.unmapped}</div>
            </div>
          </div>

          {summary.rowErrors.length > 0 && (
            <Card title={t.upload.rowErrorsTitle} style={{ borderColor: '#e9c99a', background: 'var(--ema-warn-bg)' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: '90px' }}>Fila</th>
                    <th>{t.detail.error}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rowErrors.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="mono">{r.rowNumber}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {summary.unmappedPharmacies.length > 0 && (
            <Card title={t.upload.unmappedCard}>
              <p className="muted text-sm" style={{ marginTop: 0 }}>{t.upload.unmappedHelp}</p>
              <div className="row">
                {summary.unmappedPharmacies.map((u) => (
                  <span key={u.chainPharmacyCode} className="badge badge-warn">
                    {u.chainPharmacyCode} · {u.rowCount}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <div className="confirm-bar">
            <div className="text-sm">
              {summary.validRows > 0 ? (
                <span>
                  <strong className="ok-text">{summary.validRows}</strong> {t.upload.validRowsCard.toLowerCase()} listos para enviar.
                </span>
              ) : (
                <span className="muted">{t.upload.noValid}</span>
              )}
            </div>
            <button className="btn-lg" onClick={() => void onConfirm()} disabled={busy || summary.validRows === 0}>
              {busy ? t.upload.confirming : t.upload.confirm}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
