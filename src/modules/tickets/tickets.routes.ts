import { FastifyInstance } from 'fastify';
import {
  createTicketsHandler,
  updateTicketStatusHandler,
  getAvailableTicketsHandler,
  getTicketsByUserHandler,
  purchaseTicketsHandler,
  reserveTicketsHandler,
  getTicketAccessTokenHandler,
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
    app.post('/', {
      schema: createTicketsJSONSchema,
    }, createTicketsHandler);

    // Update ticket status
    app.patch('/:ticketId/status', {
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
    }, updateTicketStatusHandler);

    // Get available tickets
    app.get('/events/:eventId/ticket-types/:ticketTypeId', {
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
    }, getAvailableTicketsHandler);

    // Get user's tickets
    app.get('/my', getTicketsByUserHandler);

    // Reserve tickets
    app.post('/reserve', {
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
    }, reserveTicketsHandler);

    // Purchase tickets
    app.post('/purchase', {
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
    }, purchaseTicketsHandler);

    // Get ticket access token
    app.get('/events/:eventId/tickets/:ticketId/access-token', {
      schema: getTicketAccessTokenJSONSchema,
    }, getTicketAccessTokenHandler);
  });
}
