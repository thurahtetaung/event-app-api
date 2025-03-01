import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateTicketsSchema,
  UpdateTicketStatusInput,
  GetTicketAccessTokenParams,
} from './tickets.schema';
import {
  createTicketsForTicketType,
  updateTicketStatus,
  getAvailableTickets,
  getTicketsByUser,
  purchaseTickets,
  reserveTickets,
  getTicketAccessToken,
} from './tickets.services';
import { logger } from '../../utils/logger';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors';
import { releaseUserTickets } from '../../utils/redis';

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
      tickets: Array<{ ticketTypeId: string; quantity: number }>;
      specificTicketIds?: string[];
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

export async function reserveTicketsHandler(
  request: FastifyRequest<{
    Body: {
      eventId: string;
      tickets: Array<{ quantity: number; ticketTypeId: string }>;
    };
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await reserveTickets(request.user.id, request.body);
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error reserving tickets: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Failed to reserve tickets' });
  }
}

export async function getTicketAccessTokenHandler(
  request: FastifyRequest<{
    Params: GetTicketAccessTokenParams;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await getTicketAccessToken(
      request.user.id,
      request.params.eventId,
      request.params.ticketId,
    );
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error getting ticket access token in controller: ${error}`);
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ message: error.message });
    }
    if (error instanceof ForbiddenError) {
      return reply.code(403).send({ message: error.message });
    }
    if (error instanceof ValidationError) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function releaseReservationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    // Extract user ID from request (will be available even with empty body)
    const userId = request.user?.id;

    if (!userId) {
      return reply.code(401).send({
        success: false,
        message: 'User not authenticated',
      });
    }

    logger.info(`Releasing all reserved tickets for user ${userId}`);
    await releaseUserTickets(userId);

    return reply.code(200).send({
      success: true,
      message: 'All ticket reservations released successfully',
    });
  } catch (error) {
    logger.error(`Error releasing ticket reservations: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply
      .code(500)
      .send({ message: 'Failed to release ticket reservations' });
  }
}
