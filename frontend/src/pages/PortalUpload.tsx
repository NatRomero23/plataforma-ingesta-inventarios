import { useState } from 'react';
import { downloadTemplate, uploadInventory, confirmLoad, type ValidationSummary } from '../services/apiClient';
import { t } from '../i18n/es-MX';

export function PortalUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>{t.upload.title}</h2>
      <button onClick={() => void downloadTemplate()}>{t.upload.downloadTemplate}</button>

      <div style={{ marginTop: '1.5rem' }}>
        <label>
          {t.upload.chooseFile}
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={() => void onValidate()} disabled={!file || busy}>
          {busy ? t.upload.validating : t.upload.validate}
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      {summary && (
        <div style={{ marginTop: '1.5rem', border: '1px solid #ccc', padding: '1rem' }}>
          <h3>{t.upload.summaryTitle}</h3>
          <p>
            {t.upload.validRows}: <strong>{summary.validRows}</strong> · {t.upload.rejectedRows}:{' '}
            <strong>{summary.rejectedRows}</strong>
          </p>

          {summary.rowErrors.length > 0 && (
            <>
              <h4>{t.upload.rowErrorsTitle}</h4>
              <ul>
                {summary.rowErrors.map((r) => (
                  <li key={r.rowNumber}>
                    Fila {r.rowNumber}: {r.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          {summary.unmappedPharmacies.length > 0 && (
            <>
              <h4>{t.upload.unmapped}</h4>
              <ul>
                {summary.unmappedPharmacies.map((u) => (
                  <li key={u.chainPharmacyCode}>
                    {u.chainPharmacyCode} ({u.rowCount})
                  </li>
                ))}
              </ul>
            </>
          )}

          <button onClick={() => void onConfirm()} disabled={busy || summary.validRows === 0}>
            {busy ? t.upload.confirming : t.upload.confirm}
          </button>
        </div>
      )}
    </section>
  );
}
