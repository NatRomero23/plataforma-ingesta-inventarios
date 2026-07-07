import type { ReactNode, CSSProperties } from 'react';

/** Tarjeta de superficie reutilizable con encabezado opcional. */
export function Card({
  title,
  actions,
  children,
  style,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="card" style={style}>
      {(title || actions) && (
        <div className="card-header row" style={{ justifyContent: 'space-between' }}>
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {actions}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}
