import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Ticket schema
export const ticketSchema = z.object({
  eventId: z.string().min(1, "Event ID is required"),
  ticketTypeId: z.string().min(1, "Ticket Type ID is required"),
  name: z.string().min(1, "Name is required"),
  price: z.number().min(0, "Price must be non-negative"),
  currency: z.string().default("usd"),
  status: z.enum(["available", "reserved", "booked"]).default("available"),
  userId: z.string().optional(),
  reservedAt: z.string().optional(),
  bookedAt: z.string().optional(),
});

// Create tickets request schema
export const createTicketsSchema = z.object({
  body: z.object({
    ticketTypeId: z.string().min(1, "Ticket Type ID is required"),
    quantity: z.number().min(1, "Quantity must be at least 1"),
  }),
});

// Export types
export type TicketSchema = z.infer<typeof ticketSchema>;
export type CreateTicketsSchema = z.infer<typeof createTicketsSchema>;

export const createTicketsJSONSchema = {
  body: zodToJsonSchema(createTicketsSchema.shape.body, 'createTicketsSchema'),
};

export const updateTicketStatusSchema = z.object({
  status: z.enum(["available", "reserved", "booked"]),
  userId: z.string().optional(),
});

export const updateTicketStatusJSONSchema = {
  body: zodToJsonSchema(updateTicketStatusSchema, 'updateTicketStatusSchema'),
};

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

// Ticket validation schema
export const validateTicketSchema = z.object({
  params: z.object({
    eventId: z.string().min(1, "Event ID is required"),
    accessToken: z.string().uuid("Invalid access token format"),
  }),
});

export type ValidateTicketParams = z.infer<typeof validateTicketSchema>['params'];

export const validateTicketJSONSchema = {
  params: zodToJsonSchema(validateTicketSchema.shape.params, 'validateTicketSchema'),
};

// Get ticket access token schema
export const getTicketAccessTokenSchema = z.object({
  params: z.object({
    eventId: z.string().min(1, "Event ID is required"),
    ticketId: z.string().min(1, "Ticket ID is required"),
  }),
});

export type GetTicketAccessTokenParams = z.infer<typeof getTicketAccessTokenSchema>['params'];

export const getTicketAccessTokenJSONSchema = {
  params: zodToJsonSchema(getTicketAccessTokenSchema.shape.params, 'getTicketAccessTokenSchema'),
};
