import { FastifyInstance } from 'fastify';
import {
  createTicketsHandler,
  updateTicketStatusHandler,
  getAvailableTicketsHandler,
  getTicketsByUserHandler,
  purchaseTicketsHandler,
} from './tickets.controllers';
import {
  createTicketsJSONSchema,
  updateTicketStatusSchema,
  updateTicketStatusJSONSchema,
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
                  ticketId: { type: 'string' },
                },
                required: ['ticketId'],
              },
            },
          },
          required: ['eventId', 'tickets'],
        },
      },
    }, purchaseTicketsHandler);
  });
}
