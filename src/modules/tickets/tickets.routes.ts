import { FastifyInstance } from 'fastify';
import {
  generateTicketsHandler,
  purchaseTicketsHandler,
} from './tickets.controllers';
import {
  TicketGenerationInput,
  UpdateEventPublishStatusInput,
  ticketGenerationSchema,
  updateEventPublishStatusSchema,
  purchaseTicketsSchema,
  PurchaseTicketsInput,
} from './tickets.schema';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function ticketRoutes(app: FastifyInstance) {
  // Generate tickets (organizer only)
  app.post<{ Body: TicketGenerationInput }>(
    '/generate',
    {
      schema: {
        body: zodToJsonSchema(ticketGenerationSchema, 'ticketGenerationSchema'),
      },
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    generateTicketsHandler,
  );

  // Purchase tickets (authenticated users)
  app.post<{ Body: PurchaseTicketsInput }>(
    '/purchase',
    {
      schema: {
        body: zodToJsonSchema(purchaseTicketsSchema, 'purchaseTicketsSchema'),
      },
      preHandler: [authenticateRequest],
    },
    purchaseTicketsHandler,
  );
}
