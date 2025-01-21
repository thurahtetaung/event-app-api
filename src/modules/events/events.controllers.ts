import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createEvent,
  deleteEvent,
  getEventById,
  getEvents,
  updateEvent,
  updateEventPublishStatus,
  checkEventExists,
} from './events.services';
import {
  CreateEventBodySchema,
  EventParamsSchema,
  UpdateEventBodySchema,
  UpdateEventPublishStatusInput,
} from './events.schema';
import { logger } from '../../utils/logger';

export async function createEventHandler(
  request: FastifyRequest<{
    Body: CreateEventBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const { startTimestamp, endTimestamp, ...rest } = request.body;
    const result = await createEvent(
      request.user.id,
      {
        ...rest,
        startTimestamp: startTimestamp ? new Date(startTimestamp) : undefined,
        endTimestamp: endTimestamp ? new Date(endTimestamp) : undefined,
      },
      request.user.role,
    );
    return reply.code(201).send(result);
  } catch (error) {
    logger.error(`Error creating event in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getEventsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const events = await getEvents();
    return reply.code(200).send(events);
  } catch (error) {
    logger.error(`Error getting events in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getEventHandler(
  request: FastifyRequest<{
    Params: EventParamsSchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const event = await getEventById(request.params.id);
    if (!event) {
      return reply.code(404).send({ message: 'Event not found' });
    }
    return reply.code(200).send(event);
  } catch (error) {
    logger.error(`Error getting event by ID in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function updateEventHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateEventBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    await checkEventExists(request.params.id);

    const { startTimestamp, endTimestamp, ...rest } = request.body;
    const result = await updateEvent(
      request.user.id,
      request.params.id,
      {
        ...rest,
        startTimestamp: startTimestamp ? new Date(startTimestamp) : undefined,
        endTimestamp: endTimestamp ? new Date(endTimestamp) : undefined,
      },
      request.user.role,
    );
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error updating event in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function deleteEventHandler(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply,
) {
  try {
    await checkEventExists(request.params.id);

    const result = await deleteEvent(
      request.user.id,
      request.params.id,
      request.user.role,
    );
    return reply.code(200).send({ message: 'Event deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting event in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function updateEventPublishStatusHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateEventPublishStatusInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await updateEventPublishStatus(
      request.user.id,
      request.params.id,
      request.body.isPublished,
      request.user.role,
    );
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error updating event publish status in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}
