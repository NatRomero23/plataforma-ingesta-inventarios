import { useState } from 'react';
import { t } from '../i18n/es-MX';

/** Muestra un valor monoespaciado con botón para copiar al portapapeles. */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible: sin acción */
    }
  }

  return (
    <span className="copy-field">
      <code className="mono">{value}</code>
      <button type="button" className="btn-sm btn-secondary" onClick={() => void copy()}>
        {copied ? t.common.copied : t.common.copy}
      </button>
    </span>
  );
}
