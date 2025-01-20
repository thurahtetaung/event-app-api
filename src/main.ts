import { env } from './config/env';
import { db } from './db';
import { logger } from './utils/logger';
import { createServer } from './utils/server';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const app = await createServer();
  await app.listen({
    port: env.PORT,
  });

  await migrate(db, {
    migrationsFolder: './drizzle/migrations',
  });
  const SIGNALS = ['SIGINT', 'SIGTERM'];
  logger.debug(env, 'Environment variables');
  SIGNALS.forEach((signal) => {
    process.on(signal, () => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      gracefulShutdown({ app });
    });
  });
  app.ready().then(() => {
    logger.info(`Server successfully started and ready to accept requests.`);
  });
}

async function gracefulShutdown({
  app,
}: {
  app: Awaited<ReturnType<typeof createServer>>;
}) {
  logger.info('SIGTERM signal received. Shutting down server...');
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
