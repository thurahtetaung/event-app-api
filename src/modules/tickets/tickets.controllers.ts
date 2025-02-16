import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateTicketsSchema, UpdateTicketStatusInput } from './tickets.schema';
import {
  createTicketsForTicketType,
  updateTicketStatus,
  getAvailableTickets,
  getTicketsByUser,
  purchaseTickets,
} from './tickets.services';
import { logger } from '../../utils/logger';

export async function createTicketsHandler(
  request: FastifyRequest<{
    Body: CreateTicketsSchema['body'];
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await createTicketsForTicketType(
      request.body.ticketTypeId,
      request.body.quantity,
    );
    return reply.code(201).send(result);
  } catch (error) {
    logger.error(`Error creating tickets in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function updateTicketStatusHandler(
  request: FastifyRequest<{
    Params: { ticketId: string };
    Body: UpdateTicketStatusInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await updateTicketStatus(
      request.params.ticketId,
      request.body,
    );
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error updating ticket status in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getAvailableTicketsHandler(
  request: FastifyRequest<{
    Params: { eventId: string; ticketTypeId: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await getAvailableTickets(
      request.params.eventId,
      request.params.ticketTypeId,
    );
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error getting available tickets in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getTicketsByUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await getTicketsByUser(request.user.id);
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error getting user tickets in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function purchaseTicketsHandler(
  request: FastifyRequest<{
    Body: {
      eventId: string;
      tickets: { ticketId: string }[];
    };
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
