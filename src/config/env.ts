import zennv from 'zennv';
import { z } from 'zod';

export const env = zennv({
  dotenv: true,
  schema: z.object({
    PORT: z.number().default(3001),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DB_URL: z
      .string()
      .default('postgres://postgres:password@localhost:5432/postgres'),
    SUPABASE_URL: z.string().default('http://localhost:8080'),
    SUPABASE_ANON_KEY: z.string().optional().default(''),
  }),
});
