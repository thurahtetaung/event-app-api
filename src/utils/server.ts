import fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import cors from '@fastify/cors';
import { pinoLogger } from './logger';
import { eventRoutes } from '../modules/events/events.routes';
import { organizationRoutes } from '../modules/organizations/organizations.routes';
import { userRoutes } from '../modules/users/users.routes';
import { organizerApplicationRoutes } from '../modules/organizer-applications/organizer-applications.routes';
import { stripeRoutes } from '../modules/stripe/stripe.routes';
import { adminRoutes } from '../modules/admin/admin.routes';
import { ticketRoutes } from '../modules/tickets/tickets.routes';
import { categoryRoutes } from '../modules/categories/categories.routes';
import { platformConfigurationsRoutes } from '../modules/platform-configurations/platform-configurations.routes';

export async function createServer() {
  const server = fastify({
    logger: pinoLogger,
  });
  // register plugins
  server.register(fastifyRawBody);
  server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });
  // register routes
  server.register(eventRoutes, { prefix: '/api/events' });
  server.register(organizationRoutes, { prefix: '/api/organizations' });
  server.register(userRoutes, { prefix: '/api/users' });
  server.register(organizerApplicationRoutes, {
    prefix: '/api/organizer-applications',
  });
  server.register(ticketRoutes, { prefix: '/api/tickets' });
  server.register(stripeRoutes, { prefix: '/api/stripe' });
  server.register(adminRoutes, { prefix: '/api/admin' });
  server.register(categoryRoutes, { prefix: '/api/categories' });
  server.register(platformConfigurationsRoutes, {
    prefix: '/api/platform-configurations',
  });
  return server;
}
