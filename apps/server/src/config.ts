import { z } from 'zod';

const envSchema = z.object({
  BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, 'BOT_TOKEN looks wrong; copy it from @BotFather'),
  WEBAPP_URL: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || v.startsWith('https://'), 'WEBAPP_URL must be https'),
  ALLOWED_ORIGINS: z.string().optional().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATA_FILE: z.string().default('.data/db.json'),
});

export type Config = ReturnType<typeof loadConfig>;

/** Reads and validates environment variables once at startup; fails fast with a readable message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}\nSee .env.example.`);
  }
  const { WEBAPP_URL, ALLOWED_ORIGINS, ...rest } = result.data;
  const origins = ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (WEBAPP_URL) origins.push(new URL(WEBAPP_URL).origin);
  return { ...rest, webAppUrl: WEBAPP_URL, allowedOrigins: origins };
}
