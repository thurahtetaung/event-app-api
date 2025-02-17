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
import { createEventSchema, createTicketTypeSchema, createTicketTypeJSONSchema } from './events.schema';

const EVENT_CATEGORIES = [
  'Conference',
  'Workshop',
  'Concert',
  'Exhibition',
  'Sports',
  'Networking',
  'Other',
];

export async function eventRoutes(app: FastifyInstance) {
  // Get all events (public)
  app.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          query: { type: 'string' },
          sort: { type: 'string', enum: ['date', 'price-low', 'price-high'] },
          date: { type: 'string' },
          priceRange: { type: 'string', enum: ['all', 'free', 'paid'] },
          minPrice: { type: 'string' },
          maxPrice: { type: 'string' },
          isOnline: { type: 'string', enum: ['true', 'false'] },
          isInPerson: { type: 'string', enum: ['true', 'false'] }
        }
      }
    }
  }, getEventsHandler);

  // Get single event (public)
  app.get('/:id', getEventHandler);

  // Protected routes
  app.register(async function (app) {
    app.addHook('onRequest', authenticateRequest);

    // Get organizer's events
    app.get('/my', getOrganizerEventsHandler);

    // Create event
    app.post('/', {
      schema: {
        body: {
          type: 'object',
          required: ['title', 'startTimestamp', 'endTimestamp', 'category', 'capacity'],
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            startTimestamp: { type: 'string' },
            endTimestamp: { type: 'string' },
            venue: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
            category: { type: 'string', enum: EVENT_CATEGORIES },
            isOnline: { type: 'boolean', default: false },
            capacity: { type: 'number', minimum: 1 },
            coverImage: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'published', 'cancelled'], default: 'draft' }
          },
          allOf: [
            {
              if: {
                properties: { isOnline: { const: false } },
                required: ['isOnline']
              },
              then: {
                required: ['venue', 'address'],
                properties: {
                  venue: { type: 'string', minLength: 1 },
                  address: { type: 'string', minLength: 1 }
                }
              }
            }
          ]
        }
      }
    }, createEventHandler);

    // Update event
    app.patch('/:id', {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            startTimestamp: { type: 'string' },
            endTimestamp: { type: 'string' },
            venue: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
            category: { type: 'string', enum: EVENT_CATEGORIES },
            isOnline: { type: 'boolean' },
            capacity: { type: 'number', minimum: 1 },
            coverImage: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'published', 'cancelled'] }
          },
          allOf: [
            {
              if: {
                properties: { isOnline: { const: false } },
                required: ['isOnline']
              },
              then: {
                properties: {
                  venue: { type: 'string', minLength: 1 },
                  address: { type: 'string', minLength: 1 }
                }
              }
            }
          ]
        }
      },
    }, updateEventHandler);

    // Delete event
    app.delete('/:id', {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    }, deleteEventHandler);

    // Update event status
    app.patch('/:id/status', {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['draft', 'published', 'cancelled'],
            },
          },
        },
      },
    }, updateEventPublishStatusHandler);

    // Get event analytics
    app.get('/:id/analytics', {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    }, getEventAnalyticsHandler);

    // Create ticket type
    app.post('/:eventId/ticket-types', {
      schema: {
        params: {
          type: 'object',
          required: ['eventId'],
          properties: {
            eventId: { type: 'string' },
          },
        },
        ...createTicketTypeJSONSchema
      },
    }, createTicketTypeHandler);

    // Update ticket type
    app.patch('/:eventId/ticket-types/:ticketTypeId', {
      schema: {
        params: {
          type: 'object',
          required: ['eventId', 'ticketTypeId'],
          properties: {
            eventId: { type: 'string' },
            ticketTypeId: { type: 'string' },
          },
        },
        ...createTicketTypeJSONSchema
      },
    }, updateTicketTypeHandler);
  });
}
