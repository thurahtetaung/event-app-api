import { FastifyInstance } from 'fastify/fastify';
import { createEventJSONSchema } from './events.schema';
import { createEventHandler } from './events.controllers';

export async function eventRouter(app: FastifyInstance) {
  app.get('/', async (request, reply) => {});

  app.post(
    '/',
    {
      schema: createEventJSONSchema,
    },
    createEventHandler,
  );
}
