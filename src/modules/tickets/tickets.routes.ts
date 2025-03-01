import { FastifyInstance } from 'fastify';
import {
  createTicketsHandler,
  updateTicketStatusHandler,
  getAvailableTicketsHandler,
  getTicketsByUserHandler,
  purchaseTicketsHandler,
  reserveTicketsHandler,
  getTicketAccessTokenHandler,
  releaseReservationsHandler,
} from './tickets.controllers';
import {
  createTicketsJSONSchema,
  updateTicketStatusSchema,
  updateTicketStatusJSONSchema,
  getTicketAccessTokenJSONSchema,
} from './tickets.schema';
import { authenticateRequest } from '../../middleware/auth';

export async function ticketRoutes(app: FastifyInstance) {
  app.register(async function (app) {
    app.addHook('onRequest', authenticateRequest);

    // Create tickets
    app.post(
      '/',
      {
        schema: createTicketsJSONSchema,
      },
      createTicketsHandler,
    );

    // Update ticket status
    app.patch(
      '/:ticketId/status',
      {
        schema: {
          params: {
            type: 'object',
            properties: {
              ticketId: { type: 'string' },
            },
            required: ['ticketId'],
          },
          ...updateTicketStatusJSONSchema,
        },
      },
      updateTicketStatusHandler,
    );

    // Get available tickets
    app.get(
      '/events/:eventId/ticket-types/:ticketTypeId',
      {
        schema: {
          params: {
            type: 'object',
            properties: {
              eventId: { type: 'string' },
              ticketTypeId: { type: 'string' },
            },
            required: ['eventId', 'ticketTypeId'],
          },
        },
      },
      getAvailableTicketsHandler,
    );

    // Get user's tickets
    app.get('/my', getTicketsByUserHandler);

    // Reserve tickets
    app.post(
      '/reserve',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              eventId: { type: 'string' },
              tickets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ticketTypeId: { type: 'string' },
                    quantity: { type: 'number' },
                  },
                  required: ['ticketTypeId', 'quantity'],
                },
              },
            },
            required: ['eventId', 'tickets'],
          },
        },
      },
      reserveTicketsHandler,
    );

    // Purchase tickets
    app.post(
      '/purchase',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              eventId: { type: 'string' },
              tickets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ticketTypeId: { type: 'string' },
                    quantity: { type: 'number' },
                  },
                  required: ['ticketTypeId', 'quantity'],
                },
              },
              specificTicketIds: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['eventId', 'tickets'],
          },
        },
      },
      purchaseTicketsHandler,
    );

    // Get ticket access token
    app.get(
      '/events/:eventId/tickets/:ticketId/access-token',
      {
        schema: getTicketAccessTokenJSONSchema,
      },
      getTicketAccessTokenHandler,
    );

    // Release all reserved tickets for the current user
    app.post(
      '/release-reservations',
      {
        schema: {
          body: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
        // Simpler approach: No validation for this endpoint
        config: {
          rawBody: true,
        },
        onRequest: (request, reply, done) => {
          // Ensure we have a valid user regardless of body content
          if (!request.user?.id) {
            reply.code(401).send({
              success: false,
              message: 'User not authenticated',
            });
            return;
          }
          done();
        },
      },
      releaseReservationsHandler,
    );
  });
}
