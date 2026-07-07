import { t } from '../i18n/es-MX';

/** Mapa de estado de carga → variante visual del badge (color semántico EMA). */
const VARIANT: Record<string, string> = {
  CONFIRMED: 'badge-ok', // confirmada = verde
  CONFIRMED_WITH_ERRORS: 'badge-warn', // confirmada con errores = advertencia
  FAILED: 'badge-danger', // fallida = rojo
  QUEUED: 'badge-info', // en cola = azul primary
  SENT: 'badge-info', // enviada = azul primary
  RECEIVED: 'badge-neutral', // recibida = gris
  VALIDATED: 'badge-neutral', // validada = gris
};

/** Badge de estado de carga, reutilizable en buzón, mis cargas y detalle. */
export function StatusBadge({ status }: { status: string }) {
  const variant = VARIANT[status] ?? 'badge-neutral';
  return <span className={`badge ${variant}`}>{t.status[status] ?? status}</span>;
}
