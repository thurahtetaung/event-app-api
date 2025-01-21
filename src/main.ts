import { env } from './config/env';
import { db } from './db';
import { logger } from './utils/logger';
import { createServer } from './utils/server';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { requestOTP } from './services/supabase/auth';

async function initializeSuperAdmin() {
  const superadminEmail = env.SUPERADMIN_EMAIL;
  if (!superadminEmail) {
    logger.warn('SUPERADMIN_EMAIL not set, skipping superadmin initialization');
    return;
  }

  // Skip if Supabase credentials aren't properly configured
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    logger.warn(
      'Supabase credentials not properly configured, skipping superadmin initialization',
    );
    return;
  }

  // Check if admin exists
  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);

  if (existingAdmin.length > 0) {
    logger.info('Admin already exists');
    return;
  }

  try {
    // Send OTP to admin email
    await requestOTP(superadminEmail);
    logger.info(`Admin initialization started for email: ${superadminEmail}`);
    logger.info('Please check your email for OTP to complete registration');
  } catch (err) {
    logger.error('Failed to initialize superadmin:', err);
    // Don't throw the error up, just log it and continue
    return;
  }
}

async function gracefulShutdown({
  app,
  signal,
}: {
  app: Awaited<ReturnType<typeof createServer>>;
  signal: string;
}) {
  logger.info(`${signal} signal received. Starting graceful shutdown...`);

  try {
    await app.close();
    logger.info('Server closed');

    // Close database connection
    await db.$client.end();
    logger.info('Database connection closed');

    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}

async function main() {
  let app: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    app = await createServer();
    const SIGNALS = ['SIGINT', 'SIGTERM'];

    // Register signal handlers before starting the server
    SIGNALS.forEach((signal) => {
      process.on(signal, () => gracefulShutdown({ app: app!, signal }));
    });

    await migrate(db, {
      migrationsFolder: './drizzle/migrations',
    });

    // Initialize superadmin
    await initializeSuperAdmin();

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.debug(env, 'Environment variables');
    app.ready().then(() => {
      logger.info(`Server successfully started and ready to accept requests.`);
    });
  } catch (err) {
    console.error('Startup error:', err); // Log to console for immediate visibility
    logger.error('Error details:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });

    if (app) {
      await gracefulShutdown({ app, signal: 'STARTUP_ERROR' });
    }
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
