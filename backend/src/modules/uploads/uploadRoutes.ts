import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { loadConfig } from '../../config/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { authJwt, requireRole } from '../../middleware/auth.js';
import { buildTemplateBuffer } from './excelTemplate.js';
import { parseInventoryExcel } from './excelParser.js';
import { ingestInventory } from '../loads/loadsService.js';
import { toValidationSummary } from '../loads/loadPresenter.js';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: loadConfig().MAX_UPLOAD_BYTES },
});

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// GET /inventory/template — descarga de la plantilla fija (FR-001)
uploadRouter.get('/inventory/template', authJwt, requireRole('PHARMACY_USER', 'ADMIN'), async (_req, res) => {
  const buffer = await buildTemplateBuffer();
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-inventario.xlsx"');
  res.send(buffer);
});

// Manejo del límite de tamaño de multer (FR-002a)
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(413, 'ARCHIVO_MUY_GRANDE', `El archivo excede el límite de ${loadConfig().MAX_UPLOAD_BYTES} bytes.`),
      );
    }
    if (err) return next(new AppError(400, 'ARCHIVO_INVALIDO', 'No se pudo procesar el archivo subido.'));
    next();
  });
}

// POST /inventory/portal-uploads — parsea, traduce y valida; NO envía (FR-005). Estado VALIDATED.
uploadRouter.post('/inventory/portal-uploads', authJwt, requireRole('PHARMACY_USER'), handleUpload, async (req, res) => {
  if (!req.file) throw new AppError(400, 'ARCHIVO_REQUERIDO', 'Debes adjuntar un archivo en el campo "file".');
  if (!req.auth?.chainId) throw new AppError(403, 'SIN_CADENA', 'Tu usuario no tiene una cadena asignada.');

  const rawRows = await parseInventoryExcel(req.file.buffer);
  const result = await ingestInventory({
    chainId: req.auth.chainId,
    origin: 'PORTAL',
    uploaderUserId: req.auth.userId ?? null,
    originalBlob: req.file.buffer,
    originalFilename: req.file.originalname,
    contentType: req.file.mimetype || XLSX_CONTENT_TYPE,
    rawRows,
    autoEnqueue: false,
  });
  res.json(toValidationSummary(result));
});
