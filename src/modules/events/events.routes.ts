import { FastifyInstance } from 'fastify';
import {
  createEventHandler,
  getEventsHandler,
  getEventHandler,
  updateEventHandler,
  deleteEventHandler,
  updateEventPublishStatusHandler,
  createTicketTypeHandler,
  getOrganizerEventsHandler,
  updateTicketTypeHandler,
  getEventAnalyticsHandler,
} from './events.controllers';
import { authenticateRequest } from '../../middleware/auth';
import {
  createEventJSONSchema,
  updateEventJSONSchema,
  createTicketTypeJSONSchema,
  eventQueryJSONSchema,
  eventIdParamJSONSchema,
  eventIdTicketTypeIdParamJSONSchema,
  updateEventStatusJSONSchema,
  eventParamSchema,
} from './events.schema';

export async function eventRoutes(app: FastifyInstance) {
  // Get all events (public)
  app.get(
    '/',
    {
      schema: eventQueryJSONSchema,
    },
    getEventsHandler,
  );

  // Get single event (public)
  app.get('/:id', { schema: eventIdParamJSONSchema }, getEventHandler);

  // Protected routes
  app.register(async function (app) {
    app.addHook('onRequest', authenticateRequest);

    // Get organizer's events
    app.get('/my', getOrganizerEventsHandler);

    // Create event
    app.post(
      '/',
      {
        schema: createEventJSONSchema,
      },
      createEventHandler,
    );

    // Update event
    app.patch(
      '/:id',
      {
        schema: {
          ...eventIdParamJSONSchema,
          ...updateEventJSONSchema,
        },
      },
      updateEventHandler,
    );

    // Delete event
    app.delete(
      '/:id',
      {
        schema: eventIdParamJSONSchema,
      },
      deleteEventHandler,
    );

    // Update event status
    app.patch(
      '/:id/status',
      {
        schema: updateEventStatusJSONSchema,
      },
      updateEventPublishStatusHandler,
    );

    // Get event analytics
    app.get(
      '/:id/analytics',
      {
        schema: eventIdParamJSONSchema,
      },
      getEventAnalyticsHandler,
    );

    // Create ticket type
    app.post(
      '/:eventId/ticket-types',
      {
        schema: {
          ...eventParamSchema,
          ...createTicketTypeJSONSchema,
        },
      },
      createTicketTypeHandler,
    );

    // Update ticket type
    app.patch(
      '/:eventId/ticket-types/:ticketTypeId',
      {
        schema: {
          ...eventIdTicketTypeIdParamJSONSchema,
          ...createTicketTypeJSONSchema,
        },
      },
      updateTicketTypeHandler,
    );
  });
}
