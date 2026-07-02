import { PrismaClient } from '@prisma/client';

/** Cliente Prisma compartido (singleton). */
export const prisma = new PrismaClient();
