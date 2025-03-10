import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createEvent,
  deleteEvent,
  getEventById,
  getEvents,
  updateEvent,
  updateEventPublishStatus,
  checkEventExists,
  checkEventOwner,
  createTicketType,
  getEventsByOrganization,
  updateTicketType,
  getEventAnalytics,
} from './events.services';
import {
  EventSchema,
  CreateEventSchema,
  CreateTicketTypeSchema,
} from './events.schema';
import { logger } from '../../utils/logger';
import { eq } from 'drizzle-orm';
import { organizations, events } from '../../db/schema';
import { db } from '../../db';
import { handleError } from '../../utils/errors';

interface RequestWithParams {
  Params: {
    id: string;
  };
}

export async function createEventHandler(
  request: FastifyRequest<{
    Body: CreateEventSchema['body'];
  }>,
  reply: FastifyReply,
) {
  try {
    const userId = request.user.id;

    // Get user's organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);

    if (!organization) {
      return reply
        .code(403)
        .send({ error: 'You must create an organization first' });
    }

    // Log the request body and organization ID for debugging
    logger.debug(
      `Creating event with data: ${JSON.stringify({
        body: request.body,
        organizationId: organization.id,
      })}`,
    );

    const event = await createEvent({
      ...request.body,
      organizationId: organization.id,
    });

    return reply.code(201).send(event);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getEventsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const queryParams = request.query as {
      category?: string;
      query?: string;
      sort?: 'date' | 'price-low' | 'price-high';
      date?: string;
      priceRange?: 'all' | 'free' | 'paid';
      minPrice?: string;
      maxPrice?: string;
      isOnline?: string;
      isInPerson?: string;
      limit?: string;
    };

    logger.debug('Received query params:', queryParams);

    // Convert limit to a number if it exists
    const parsedParams = {
      ...queryParams,
      limit: queryParams.limit ? parseInt(queryParams.limit) : undefined,
    };

    const events = await getEvents(parsedParams);
    return reply.code(200).send(events);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getEventHandler(
  request: FastifyRequest<RequestWithParams>,
  reply: FastifyReply,
) {
  try {
    const event = await getEventById(request.params.id);
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' });
    }
    return reply.code(200).send(event);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateEventHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: Partial<EventSchema>;
  }>,
  reply: FastifyReply,
) {
  try {
    await checkEventExists(request.params.id);
    const event = await updateEvent(
      request.user.id,
      request.params.id,
      request.body,
      request.user.role,
    );
    return reply.code(200).send(event);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function deleteEventHandler(
  request: FastifyRequest<RequestWithParams>,
  reply: FastifyReply,
) {
  try {
    await checkEventExists(request.params.id);
    await deleteEvent(request.user.id, request.params.id, request.user.role);
    return reply.code(200).send({ message: 'Event deleted successfully' });
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateEventPublishStatusHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { status: 'draft' | 'published' | 'cancelled' };
  }>,
  reply: FastifyReply,
) {
  try {
    const event = await updateEventPublishStatus(
      request.user.id,
      request.params.id,
      request.body.status,
      request.user.role,
    );
    return reply.code(200).send(event);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function createTicketTypeHandler(
  request: FastifyRequest<{
    Body: CreateTicketTypeSchema['body'];
    Params: { eventId: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const { eventId } = request.params;
    const userId = request.user.id;

    // Get event with organization details
    const [eventWithOrg] = await db
      .select({
        event: events,
        organization: organizations,
      })
      .from(events)
      .innerJoin(organizations, eq(events.organizationId, organizations.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventWithOrg) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    // Check if user owns the organization
    if (eventWithOrg.organization.ownerId !== userId) {
      return reply.code(403).send({ error: 'Unauthorized' });
    }

    const ticketType = await createTicketType({
      ...request.body,
      eventId,
    });

    return reply.code(201).send(ticketType);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getOrganizerEventsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const userId = request.user.id;

    // Get user's organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);

    if (!organization) {
      return reply
        .code(403)
        .send({ error: 'You must create an organization first' });
    }

    const events = await getEventsByOrganization(organization.id);
    return reply.code(200).send(events);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateTicketTypeHandler(
  request: FastifyRequest<{
    Body: CreateTicketTypeSchema['body'];
    Params: { eventId: string; ticketTypeId: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const { eventId, ticketTypeId } = request.params;
    const userId = request.user.id;

    // Get event with organization details
    const [eventWithOrg] = await db
      .select({
        event: events,
        organization: organizations,
      })
      .from(events)
      .innerJoin(organizations, eq(events.organizationId, organizations.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventWithOrg) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    // Check if user owns the organization
    if (eventWithOrg.organization.ownerId !== userId) {
      return reply.code(403).send({ error: 'Unauthorized' });
    }

    const ticketType = await updateTicketType(
      eventId,
      ticketTypeId,
      request.body,
    );
    return reply.code(200).send(ticketType);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getEventAnalyticsHandler(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const userId = request.user.id;
    await checkEventOwner(userId, request.params.id, request.user.role);
    const analytics = await getEventAnalytics(request.params.id);
    return reply.code(200).send(analytics);
  } catch (error) {
    return handleError(error, request, reply);
  }
}
