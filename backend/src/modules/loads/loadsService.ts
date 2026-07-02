import { v4 as uuidv4 } from 'uuid';
import type { LoadOrigin } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { buildPharmacyLookup, type PharmacyLookup } from '../translation/translatePharmacyCode.js';
import { validateRows, type RawRow, type ValidationResult } from '../validation/validateRows.js';

/** Construye el mapa de equivalencias de una cadena desde la BD (Pharmacy). */
export async function buildLookupForChain(chainId: string): Promise<PharmacyLookup> {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { chainId },
    select: { chainInternalCode: true, redVidarPharmacyCode: true, isActive: true },
  });
  return buildPharmacyLookup(pharmacies);
}

export interface IngestParams {
  chainId: string;
  origin: LoadOrigin;
  uploaderUserId?: string | null;
  apiKeyId?: string | null;
  sourceLabel?: string | null;
  originalBlob: Buffer;
  originalFilename?: string | null;
  contentType: string;
  rawRows: RawRow[];
  /** true para carga por API: encola automáticamente los válidos (FR-010a). */
  autoEnqueue: boolean;
}

export interface IngestResult {
  loadId: string;
  status: string;
  validation: ValidationResult;
}

/**
 * Valida localmente (Principio VIII), persiste la carga con su original, renglones y conteos (FR-021),
 * y opcionalmente encola los válidos (API, FR-010a). El portal queda en VALIDATED hasta confirmar (FR-006).
 */
export async function ingestInventory(params: IngestParams): Promise<IngestResult> {
  const lookup = await buildLookupForChain(params.chainId);
  const validation = validateRows(params.rawRows, lookup);

  const canEnqueue = params.autoEnqueue && validation.validRows > 0;

  const load = await prisma.$transaction(async (tx) => {
    const created = await tx.load.create({
      data: {
        chainId: params.chainId,
        origin: params.origin,
        uploaderUserId: params.uploaderUserId ?? null,
        apiKeyId: params.apiKeyId ?? null,
        sourceLabel: params.sourceLabel ?? null,
        status: canEnqueue ? 'QUEUED' : 'VALIDATED',
        idempotencyKey: canEnqueue ? uuidv4() : null,
        originalBlob: params.originalBlob,
        originalFilename: params.originalFilename ?? null,
        contentType: params.contentType,
        byteSize: params.originalBlob.byteLength,
        totalRows: validation.totalRows,
        validRows: validation.validRows,
        rejectedRows: validation.rejectedRows,
        unmappedPharmacyCount: validation.unmappedPharmacyCount,
        rows: {
          create: validation.rows.map((r) => ({
            rowNumber: r.rowNumber,
            chainPharmacyCode: r.chainPharmacyCode,
            redVidarPharmacyCode: r.redVidarPharmacyCode,
            ean: r.ean,
            productName: r.productName,
            stock: r.stock,
            status: r.status,
            rejectionReason: r.rejectionReason,
          })),
        },
      },
    });
    if (canEnqueue) {
      await tx.dispatchJob.create({ data: { loadId: created.id } });
    }
    return created;
  });

  return { loadId: load.id, status: load.status, validation };
}

/**
 * Confirma una carga de portal: VALIDATED -> QUEUED, genera la clave de idempotencia y crea el job (FR-006/007).
 * Rechaza si no está en VALIDATED o no tiene renglones válidos.
 */
export async function confirmLoad(loadId: string, requesterChainId: string | null, isPrivileged: boolean): Promise<void> {
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) throw new AppError(404, 'CARGA_NO_ENCONTRADA', 'No se encontró la carga.');
  if (!isPrivileged && load.chainId !== requesterChainId) {
    throw new AppError(403, 'SIN_PERMISO', 'No tienes permiso sobre esta carga.');
  }
  if (load.status !== 'VALIDATED') {
    throw new AppError(409, 'ESTADO_INVALIDO', 'La carga no está en estado validada.');
  }
  if (load.validRows <= 0) {
    throw new AppError(409, 'SIN_RENGLONES_VALIDOS', 'La carga no tiene renglones válidos para enviar.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.load.update({
      where: { id: loadId },
      data: { status: 'QUEUED', idempotencyKey: uuidv4() },
    });
    await tx.dispatchJob.create({ data: { loadId } });
  });
}

/** Detalle de una carga para respuesta (estado, conteos, resultado, intentos, quién la subió — FR-024). */
export async function getLoadSummary(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      rows: true,
      attempts: { orderBy: { attemptNumber: 'asc' } },
      redVidarResult: true,
      uploader: { select: { email: true } },
      apiKey: { select: { last4: true } },
    },
  });
  if (!load) throw new AppError(404, 'CARGA_NO_ENCONTRADA', 'No se encontró la carga.');
  return load;
}

/** Recupera el archivo/payload original de una carga para descarga (FR-024, Principio VII). */
export async function getLoadOriginal(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { chainId: true, originalBlob: true, originalFilename: true, contentType: true },
  });
  if (!load) throw new AppError(404, 'CARGA_NO_ENCONTRADA', 'No se encontró la carga.');
  return load;
}
