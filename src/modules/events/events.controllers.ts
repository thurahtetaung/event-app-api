import { FastifyReply, FastifyRequest } from 'fastify';
import { createEvent } from './events.services';
import { createEventBodySchema } from './events.schema';

export async function createEventHandler(
  request: FastifyRequest<{
    Body: createEventBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { name, organizationId, capacity } = request.body;
  const result = await createEvent({
    name,
    organizationId,
    capacity,
  });
  return result;
}
