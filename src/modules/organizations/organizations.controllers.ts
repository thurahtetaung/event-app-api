import { FastifyReply, FastifyRequest } from 'fastify';
import { createOrganization } from './organizations.services';
import { createOrganizationBodySchema } from './organizations.schema';

export async function createOrganizationHandler(
  request: FastifyRequest<{
    Body: createOrganizationBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { name } = request.body;
  const result = await createOrganization({
    name,
  });
  return result;
}
