import { FastifyInstance } from 'fastify';
import {
  createEventJSONSchema,
  deleteEventJSONSchema,
  updateEventJSONSchema,
  updateEventPublishStatusSchema,
  UpdateEventPublishStatusInput,
  eventParamsSchema,
  CreateEventBodySchema,
  UpdateEventBodySchema,
} from './events.schema';
import {
  createEventHandler,
  deleteEventHandler,
  getEventHandler,
  getEventsHandler,
  updateEventHandler,
  updateEventPublishStatusHandler,
} from './events.controllers';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function eventRoutes(app: FastifyInstance) {
  // Get all events
  app.get('/', getEventsHandler);

  // Get event by id
  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: zodToJsonSchema(eventParamsSchema, 'eventParamsSchema'),
      },
    },
    getEventHandler,
  );

  // Create event (organizer only)
  app.post<{ Body: CreateEventBodySchema }>(
    '/',
    {
      schema: createEventJSONSchema,
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    createEventHandler,
  );

  // Update event (organizer only)
  app.patch<{
    Params: { id: string };
    Body: UpdateEventBodySchema;
  }>(
    '/:id',
    {
      schema: updateEventJSONSchema,
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    updateEventHandler,
  );

  // Delete event (organizer only)
  app.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: deleteEventJSONSchema,
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    deleteEventHandler,
  );

  // Update event publish status (organizer only)
  app.patch<{
    Params: { id: string };
    Body: UpdateEventPublishStatusInput;
  }>(
    '/:id/publish',
    {
      schema: {
        body: zodToJsonSchema(
          updateEventPublishStatusSchema,
          'updateEventPublishStatusSchema',
        ),
        params: zodToJsonSchema(eventParamsSchema, 'eventParamsSchema'),
      },
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    updateEventPublishStatusHandler,
  );
}
