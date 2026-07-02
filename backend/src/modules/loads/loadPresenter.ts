import type { IngestResult } from './loadsService.js';

/** Resumen de validación para la respuesta de portal/API (FR-005, FR-010). */
export function toValidationSummary(result: IngestResult) {
  return {
    loadId: result.loadId,
    status: result.status,
    totalRows: result.validation.totalRows,
    validRows: result.validation.validRows,
    rejectedRows: result.validation.rejectedRows,
    rowErrors: result.validation.rowErrors,
    unmappedPharmacies: result.validation.unmappedPharmacies,
  };
}

/** Detalle de carga (buzón US3 y consulta de estado): incluye quién la subió, conteos, resultado e intentos. */
export function toLoadDetail(load: {
  id: string;
  chainId: string;
  origin: string;
  status: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  unmappedPharmacyCount: number;
  sourceLabel: string | null;
  originalFilename: string | null;
  createdAt: Date;
  uploader?: { email: string } | null;
  apiKey?: { last4: string } | null;
  rows: Array<{ rowNumber: number; status: string; rejectionReason: string | null }>;
  attempts: Array<{
    attemptNumber: number;
    startedAt: Date;
    finishedAt: Date | null;
    httpStatus: number | null;
    webhookEventId: string | null;
    errorReason: string | null;
  }>;
  redVidarResult: {
    webhookEventId: string;
    entriesInserted: number | null;
    medicationsInserted: number | null;
    medicationsUpdated: number | null;
    unknownPharmacyCodes: string[];
    rowErrors: unknown;
  } | null;
}) {
  return {
    loadId: load.id,
    chainId: load.chainId,
    origin: load.origin,
    status: load.status,
    totalRows: load.totalRows,
    validRows: load.validRows,
    rejectedRows: load.rejectedRows,
    unmappedPharmacyCount: load.unmappedPharmacyCount,
    sourceLabel: load.sourceLabel,
    originalFilename: load.originalFilename,
    uploadedBy: load.uploader?.email ?? (load.apiKey ? `API ****${load.apiKey.last4}` : null),
    createdAt: load.createdAt,
    rejectedDetail: load.rows
      .filter((r) => r.status === 'REJECTED')
      .map((r) => ({ rowNumber: r.rowNumber, reason: r.rejectionReason })),
    attempts: load.attempts.map((a) => ({
      attemptNumber: a.attemptNumber,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      httpStatus: a.httpStatus,
      webhookEventId: a.webhookEventId,
      errorReason: a.errorReason,
    })),
    redVidarResult: load.redVidarResult,
  };
}
