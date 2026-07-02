import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

/**
 * Datos semilla para probar US1–US4 de forma independiente: 1 cadena, farmacias mapeadas (y una sin mapear),
 * 1 usuario-farmacia y 1 clave de API. La clave en claro se imprime una sola vez (nunca se persiste en claro).
 */
const prisma = new PrismaClient();

async function main() {
  const chain = await prisma.chain.upsert({
    where: { name: 'Farmacias Demo' },
    update: {},
    create: { name: 'Farmacias Demo' },
  });

  // Upsert por (chainId, chainInternalCode): determinista y sin omitir filas en silencio.
  const demoPharmacies = [
    { chainInternalCode: 'SUC-01', redVidarPharmacyCode: 'RV1001', name: 'Sucursal Centro' },
    { chainInternalCode: 'SUC-02', redVidarPharmacyCode: 'RV1002', name: 'Sucursal Norte' },
    { chainInternalCode: 'SUC-03', redVidarPharmacyCode: null, name: 'Sucursal Sin Mapear' },
  ];
  for (const p of demoPharmacies) {
    await prisma.pharmacy.upsert({
      where: { chainId_chainInternalCode: { chainId: chain.id, chainInternalCode: p.chainInternalCode } },
      update: { redVidarPharmacyCode: p.redVidarPharmacyCode, name: p.name },
      create: { chainId: chain.id, ...p },
    });
  }

  const passwordHash = await bcrypt.hash('demo1234', 10);
  await prisma.user.upsert({
    where: { email: 'farmacia@demo.mx' },
    update: {},
    create: { email: 'farmacia@demo.mx', passwordHash, role: 'PHARMACY_USER', chainId: chain.id },
  });
  await prisma.user.upsert({
    where: { email: 'admin@demo.mx' },
    update: {},
    create: { email: 'admin@demo.mx', passwordHash, role: 'ADMIN', chainId: null },
  });

  const apiKeyPlain = `${process.env.PLATFORM_API_KEY_PREFIX ?? 'emp_live_'}DEMOKEY0001`;
  const keyHash = await bcrypt.hash(apiKeyPlain, 10);
  const existing = await prisma.apiKey.findFirst({ where: { chainId: chain.id, status: 'ACTIVE' } });
  if (!existing) {
    await prisma.apiKey.create({
      data: { chainId: chain.id, prefix: process.env.PLATFORM_API_KEY_PREFIX ?? 'emp_live_', keyHash, last4: apiKeyPlain.slice(-4) },
    });
    // eslint-disable-next-line no-console
    console.log(`Clave de API de integrador (guárdala, se muestra solo aquí): ${apiKeyPlain}`);
  }

  // eslint-disable-next-line no-console
  console.log('Semilla completada. Usuario farmacia: farmacia@demo.mx / demo1234');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
