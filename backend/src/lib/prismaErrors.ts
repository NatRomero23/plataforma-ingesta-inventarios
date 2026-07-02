import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

/** Ejecuta una operación de escritura y traduce la violación de unicidad (P2002) a un 409 con mensaje es-MX. */
export async function withUniqueConflict<T>(message: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'CONFLICTO_UNICIDAD', message);
    }
    throw err;
  }
}
