import zennv from 'zennv';
import { z } from 'zod';

export const env = zennv({
  dotenv: true,
  schema: z.object({
    PORT: z.number().default(3000),
    HOST: z.string().default('localhost'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DB_URL: z.string(),
    // Supabase configuration
    SUPABASE_URL: z.string(),
    SUPABASE_ANON_KEY: z.string().default(''),
    SUPERADMIN_EMAIL: z.string().optional(),
    // Stripe configuration
    STRIPE_SECRET_KEY: z.string(),
    STRIPE_PUBLISHABLE_KEY: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),
    // JWT configuration
    JWT_SECRET: z.string(),
    // Redis configuration
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_TICKET_LOCK_DURATION: z.number().default(600), // 10 minutes in seconds
    API_URL: z.string(),
    // Email configuration
    RESEND_API_KEY: z.string(),
    EMAIL_FROM: z.string().default('notifications@eventapp.io'),
  }),
});