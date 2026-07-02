// Carga .env (DATABASE_URL real, secretos) antes de aplicar valores por defecto.
import 'dotenv/config';

// Configuración de entorno para pruebas. Provee valores por defecto para que loadConfig() resuelva
// al importar módulos. Para las pruebas con base de datos, exporta RUN_DB_TESTS=1 y un DATABASE_URL real.
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/redvidar_test?schema=public';
process.env.JWT_SECRET ||= 'test-secret';
process.env.RED_VIDAR_API_KEY ||= 'rv_pc_live_TESTKEY';
process.env.RED_VIDAR_BASE_URL ||= 'http://redvidar.test/v1';
process.env.MAX_UPLOAD_BYTES ||= String(10 * 1024 * 1024);
process.env.PLATFORM_API_KEY_PREFIX ||= 'emp_live_';
