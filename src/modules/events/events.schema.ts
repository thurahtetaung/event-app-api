import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const EVENT_CATEGORIES = [
  'Conference',
  'Workshop',
  'Concert',
  'Exhibition',
  'Sports',
  'Networking',
  'Other',
] as const;

const baseEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startTimestamp: z.string(),
  endTimestamp: z.string(),
  venue: z.string().nullable(),
  address: z.string().nullable(),
  category: z.enum(EVENT_CATEGORIES),
  isOnline: z.boolean().default(false),
  capacity: z.number().min(1, "Capacity must be at least 1"),
  coverImage: z.string().optional(), // URL after upload
  organizationId: z.string().min(1, "Organization ID is required"),
  status: z.enum(["draft", "published", "cancelled"]).default("draft"),
});

export const eventSchema = baseEventSchema.refine((data) => {
  // If it's not an online event, venue and address are required
  if (!data.isOnline) {
    if (!data.venue) return false;
    if (!data.address) return false;
  }
  return true;
}, {
  message: "Venue and address are required for in-person events",
  path: ["venue"],
});

// Ticket type schema
export const ticketTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().min(0, "Price must be non-negative"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  type: z.enum(["paid", "free"]),
  saleStart: z.string(),
  saleEnd: z.string(),
  maxPerOrder: z.number().optional(),
  minPerOrder: z.number().optional(),
  eventId: z.string().min(1, "Event ID is required"),
});

// Create event request schema
export const createEventSchema = z.object({
  body: baseEventSchema.omit({ organizationId: true }),
});

// Create ticket type request schema
export const createTicketTypeSchema = z.object({
  body: ticketTypeSchema.omit({ eventId: true }),
});

// Export types
export type EventSchema = z.infer<typeof eventSchema>;
export type TicketTypeSchema = z.infer<typeof ticketTypeSchema>;
export type CreateEventSchema = z.infer<typeof createEventSchema>;
export type CreateTicketTypeSchema = z.infer<typeof createTicketTypeSchema>;

export const createEventJSONSchema = {
  body: zodToJsonSchema(createEventSchema.shape.body, 'createEventSchema'),
};

export const updateEventJSONSchema = {
  body: zodToJsonSchema(createEventSchema.shape.body, 'createEventSchema'),
};

export const deleteEventJSONSchema = {
  params: zodToJsonSchema(eventSchema, 'eventSchema'),
};

export const updateEventPublishStatusSchema = z.object({
  isPublished: z.boolean(),
});

export type UpdateEventPublishStatusInput = z.infer<
  typeof updateEventPublishStatusSchema
>;

export const createTicketTypeJSONSchema = {
  body: zodToJsonSchema(createTicketTypeSchema.shape.body, 'createTicketTypeSchema'),
};
