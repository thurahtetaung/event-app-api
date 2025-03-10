import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateTicketsSchema,
  UpdateTicketStatusInput,
  GetTicketAccessTokenParams,
  ValidateTicketParams,
  ValidateTicketQuery,
  GetTicketDetailsParams,
} from './tickets.schema';
import {
  createTicketsForTicketType,
  updateTicketStatus,
  getAvailableTickets,
  getTicketsByUser,
  purchaseTickets,
  reserveTickets,
  getTicketAccessToken,
  verifyTicketWithAccessToken,
  validateTicket,
  getTicketDetails,
} from './tickets.services';
import { logger } from '../../utils/logger';
import { handleError } from '../../utils/errors';
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
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
  }
}

export async function verifyTicketHandler(
  request: FastifyRequest<{
    Params: ValidateTicketParams;
    Querystring: ValidateTicketQuery;
  }>,
  reply: FastifyReply,
) {
  try {
    const { eventId, ticketId } = request.params;
    const { accessToken } = request.query;

    logger.info(`Verifying ticket ${ticketId} for event ${eventId}`);

    const result = await verifyTicketWithAccessToken(
      eventId,
      ticketId,
      accessToken,
    );

    return reply.code(200).send(result);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function validateTicketHandler(
  request: FastifyRequest<{
    Params: ValidateTicketParams;
    Body: { accessToken: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const { eventId, ticketId } = request.params;
    const { accessToken } = request.body;
    const userId = request.user.id;

    logger.info(`Validating ticket ${ticketId} for event ${eventId}`);

    const result = await validateTicket(userId, eventId, ticketId, accessToken);

    return reply.code(200).send(result);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getTicketDetailsHandler(
  request: FastifyRequest<{
    Params: GetTicketDetailsParams;
  }>,
  reply: FastifyReply,
) {
  try {
    const { eventId, ticketId } = request.params;

    logger.info(
      `Getting ticket details for ticket ${ticketId} for event ${eventId}`,
    );

    const result = await getTicketDetails(eventId, ticketId);

    return reply.code(200).send(result);
  } catch (error) {
    return handleError(error, request, reply);
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
    return handleError(error, request, reply);
  }
}
