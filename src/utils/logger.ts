import { pino } from 'pino';
import { env } from '../config/env';

export const pinoLogger = {
  redact: [
    'DB_URL',
    'SUPABASE_ANON_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'JWT_SECRET',
    'RESEND_API_KEY',
  ],
  level: env.LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
  },
};

export const logger = pino(pinoLogger);
