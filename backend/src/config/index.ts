import { z } from 'zod';

/**
 * Cargador y validación de configuración de entorno.
 * La credencial de Red Vidar (RED_VIDAR_API_KEY) se lee SOLO aquí y se usa solo en el módulo redvidar.
 * Nunca se expone al frontend, ni en logs, ni en respuestas (Principio V, FR-030).
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  RED_VIDAR_API_KEY: z.string().min(1),
  RED_VIDAR_BASE_URL: z.string().url(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  PORT: z.coerce.number().int().positive().default(3001),
  PLATFORM_API_KEY_PREFIX: z.string().min(1).default('emp_live_'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Solo para pruebas: limpia la caché de configuración. */
export function resetConfigCache(): void {
  cached = null;
}
