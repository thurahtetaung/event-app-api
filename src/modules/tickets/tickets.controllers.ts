import { FastifyReply, FastifyRequest } from 'fastify';
import {
  TicketGenerationInput,
  UpdateEventPublishStatusInput,
  PurchaseTicketsInput,
} from './tickets.schema';
import { generateTickets, purchaseTickets } from './tickets.services';
import { logger } from '../../utils/logger';

export async function generateTicketsHandler(
  request: FastifyRequest<{
    Body: TicketGenerationInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await generateTickets(request.user.id, request.body);
    return reply.code(201).send(result);
  } catch (error) {
    logger.error(`Error generating tickets in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function purchaseTicketsHandler(
  request: FastifyRequest<{
    Body: PurchaseTicketsInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await purchaseTickets(request.user.id, request.body);
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error purchasing tickets in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}
