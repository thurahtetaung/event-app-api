import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  breakpoints: false,
  casing: 'snake_case',
  dbCredentials: {
    url: env.DB_URL,
  },
});
