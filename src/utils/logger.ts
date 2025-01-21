import { pino } from 'pino';
import { env } from '../config/env';

export const pinoLogger = {
  redact: ['DB_URL', 'SUPABASE_ANON_KEY'],
  level: env.LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
  },
};

export const logger = pino(pinoLogger);
