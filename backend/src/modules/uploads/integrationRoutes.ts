import { Router } from 'express';
import { z } from 'zod';
import { authApiKey } from '../../middleware/authApiKey.js';
import { AppError } from '../../middleware/errorHandler.js';
import { ingestInventory } from '../loads/loadsService.js';
import { toValidationSummary } from '../loads/loadPresenter.js';
import type { RawRow } from '../validation/validateRows.js';

export const integrationRouter = Router();

// Contrato espejo de Red Vidar (FR-008). pharmacyCode aquí es el código DE LA CADENA (se traduce).
// Los campos se reciben de forma laxa para que los renglones inválidos se reporten por índice
// (FR-009: misma validación que el portal), en vez de rechazar todo el payload.
const submissionSchema = z.object({
  sourceLabel: z.string().min(1),
  items: z
    .array(
      z.object({
        pharmacyCode: z.union([z.string(), z.number()]).optional(),
        ean: z.union([z.string(), z.number()]).optional(),
        productName: z.union([z.string(), z.number()]).optional(),
        stock: z.unknown().optional(),
      }),
    )
    .min(1),
});

// POST /integration/inventory — ingesta por API. Valida, traduce y AUTO-ENCOLA los válidos (FR-010/010a).
integrationRouter.post('/integration/inventory', authApiKey, async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'PAYLOAD_INVALIDO', 'El cuerpo debe incluir sourceLabel e items[] no vacío.');
  }
  if (!req.auth?.chainId) {
    throw new AppError(403, 'SIN_CADENA', 'La clave de API no está asociada a una cadena.');
  }

  const rawRows: RawRow[] = parsed.data.items.map((it, index) => ({
    rowNumber: index + 1,
    chainPharmacyCode: it.pharmacyCode ?? '',
    ean: it.ean ?? '',
    productName: it.productName ?? '',
    stock: it.stock,
  }));

  const result = await ingestInventory({
    chainId: req.auth.chainId,
    origin: 'API',
    apiKeyId: req.auth.apiKeyId ?? null,
    sourceLabel: parsed.data.sourceLabel,
    originalBlob: Buffer.from(JSON.stringify(req.body)),
    contentType: 'application/json',
    rawRows,
    autoEnqueue: true, // FR-010a: sin paso de confirmación
  });

  res.json(toValidationSummary(result));
});
