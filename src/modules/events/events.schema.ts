import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Remove EVENT_CATEGORIES constant since we don't need it anymore

const baseEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  startTimestamp: z.string(),
  endTimestamp: z.string(),
  venue: z.string().nullable(),
  address: z.string().nullable(),
  // Only use categoryId for proper relation
  categoryId: z.string().min(1, 'Category ID is required'),
  // Remove category field completely
  isOnline: z.boolean().default(false),
  capacity: z.number().min(1, 'Capacity must be at least 1'),
  coverImage: z.string().optional(), // URL after upload
  organizationId: z.string().min(1, 'Organization ID is required'),
  status: z.enum(['draft', 'published', 'cancelled']).default('draft'),
});

export const eventSchema = baseEventSchema.refine(
  (data) => {
    // If it's not an online event, venue and address are required
    if (!data.isOnline) {
      if (!data.venue) return false;
      if (!data.address) return false;
    }
    return true;
  },
  {
    message: 'Venue and address are required for in-person events',
    path: ['venue'],
  },
);

// Ticket type schema
export const ticketTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  type: z.enum(['paid', 'free']),
  saleStart: z.string(),
  saleEnd: z.string(),
  maxPerOrder: z.number().optional(),
  minPerOrder: z.number().optional(),
  eventId: z.string().min(1, 'Event ID is required'),
});

// Create event request schema
export const createEventSchema = z.object({
  body: baseEventSchema.omit({ organizationId: true }),
});

// Create ticket type request schema
export const createTicketTypeSchema = z.object({
  body: ticketTypeSchema.omit({ eventId: true }),
});

// Query parameters schema
export const eventQuerySchema = z.object({
  category: z.string().optional(),
  query: z.string().optional(),
  sort: z.enum(['date', 'price-low', 'price-high']).optional(),
  date: z.string().optional(),
  priceRange: z.enum(['all', 'free', 'paid']).optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  isOnline: z.enum(['true', 'false']).optional(),
  isInPerson: z.enum(['true', 'false']).optional(),
});

// ID parameter schema
export const eventIdParamSchema = z.object({
  id: z.string().min(1, 'Event ID is required'),
});

// Event ID and Ticket Type ID parameter schema
export const eventIdTicketTypeIdParamSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  ticketTypeId: z.string().min(1, 'Ticket Type ID is required'),
});

// Update event status schema
export const updateEventStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'cancelled']),
});

// Export types
export type EventSchema = z.infer<typeof eventSchema>;
export type TicketTypeSchema = z.infer<typeof ticketTypeSchema>;
export type CreateEventSchema = z.infer<typeof createEventSchema>;
export type CreateTicketTypeSchema = z.infer<typeof createTicketTypeSchema>;
export type EventQuerySchema = z.infer<typeof eventQuerySchema>;
export type EventIdParamSchema = z.infer<typeof eventIdParamSchema>;
export type EventIdTicketTypeIdParamSchema = z.infer<
  typeof eventIdTicketTypeIdParamSchema
>;
export type UpdateEventStatusSchema = z.infer<typeof updateEventStatusSchema>;

// Convert to JSON schemas
export const createEventJSONSchema = {
  body: zodToJsonSchema(createEventSchema.shape.body, 'createEventSchema'),
};

export const updateEventJSONSchema = {
  body: zodToJsonSchema(createEventSchema.shape.body, 'createEventSchema'),
};

export const deleteEventJSONSchema = {
  params: zodToJsonSchema(eventIdParamSchema, 'eventIdParamSchema'),
};

export const eventQueryJSONSchema = {
  querystring: zodToJsonSchema(eventQuerySchema, 'eventQuerySchema'),
};

export const eventIdParamJSONSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

export const eventParamSchema = {
  params: {
    type: 'object',
    required: ['eventId'],
    properties: {
      eventId: { type: 'string' },
    },
  },
};

export const eventIdTicketTypeIdParamJSONSchema = {
  params: {
    type: 'object',
    required: ['eventId', 'ticketTypeId'],
    properties: {
      eventId: { type: 'string' },
      ticketTypeId: { type: 'string' },
    },
  },
};

export const updateEventStatusJSONSchema = {
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
};

export const updateEventPublishStatusSchema = z.object({
  isPublished: z.boolean(),
});

export type UpdateEventPublishStatusInput = z.infer<
  typeof updateEventPublishStatusSchema
>;

export const createTicketTypeJSONSchema = {
  body: zodToJsonSchema(
    createTicketTypeSchema.shape.body,
    'createTicketTypeSchema',
  ),
};

export const eventAnalyticsSchema = z.object({
  totalTicketsSold: z.number(),
  totalRevenue: z.number(),
  ticketTypeStats: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['paid', 'free']),
      totalSold: z.number(),
      totalRevenue: z.number(),
      status: z.enum(['on-sale', 'paused', 'sold-out', 'scheduled']),
    }),
  ),
  salesByDay: z.array(
    z.object({
      date: z.string(),
      count: z.number(),
      revenue: z.number(),
    }),
  ),
});

export type EventAnalytics = z.infer<typeof eventAnalyticsSchema>;
