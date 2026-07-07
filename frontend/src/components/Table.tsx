import type { ReactNode } from 'react';

/**
 * Tabla con estilos EMA (thead gris, filas zebra) y desplazamiento horizontal
 * en pantallas chicas. Recibe el <thead>/<tbody> como hijos para conservar la
 * estructura de cada pantalla sin duplicar estilos.
 */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="ema-table">{children}</table>
    </div>
  );
}
