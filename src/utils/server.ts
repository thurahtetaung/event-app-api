import fastify from 'fastify';
import { pinoLogger } from './logger';
import { eventRouter } from '../modules/events/events.routes';
import { organizationRouter } from '../modules/organizations/organizations.routes';
import { userRouter } from '../modules/users/users.routes';

export async function createServer() {
  const server = fastify({
    logger: pinoLogger,
  });
  // register plugins

  // register routes
  server.register(eventRouter, { prefix: '/api/events' });
  server.register(organizationRouter, { prefix: '/api/organizations' });
  server.register(userRouter, { prefix: '/api/users' });
  return server;
}
