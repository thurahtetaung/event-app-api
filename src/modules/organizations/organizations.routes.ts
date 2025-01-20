import { FastifyInstance } from 'fastify/fastify';
import { createOrganizationJSONSchema } from './organizations.schema';
import { createOrganizationHandler } from './organizations.controllers';

export async function organizationRouter(app: FastifyInstance) {
  app.get('/', async (request, reply) => {});

  app.post(
    '/',
    {
      schema: createOrganizationJSONSchema,
    },
    createOrganizationHandler,
  );
}
