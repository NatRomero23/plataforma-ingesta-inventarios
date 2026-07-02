import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Los archivos con BD comparten una única base; se ejecutan en serie para evitar carreras.
    fileParallelism: false,
    // Las pruebas que requieren PostgreSQL vivo se marcan y omiten si DATABASE_URL no apunta a una BD de prueba.
    testTimeout: 20000,
  },
});
