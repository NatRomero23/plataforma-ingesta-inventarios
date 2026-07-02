import { prisma } from '../../src/lib/prisma.js';

/**
 * Limpia la base de datos de prueba en orden seguro respecto a las llaves foráneas (RESTRICT).
 * Se usa al inicio de cada archivo de prueba con BD para partir de un estado limpio.
 */
export async function resetDb(): Promise<void> {
  await prisma.dispatchAttempt.deleteMany();
  await prisma.redVidarResult.deleteMany();
  await prisma.dispatchJob.deleteMany();
  await prisma.loadRow.deleteMany();
  await prisma.load.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.pharmacy.deleteMany();
  await prisma.user.deleteMany();
  await prisma.chain.deleteMany();
  await prisma.retentionPolicy.deleteMany();
}
