import { z } from 'zod';

export const ticketGenerationSchema = z.object({
  eventId: z.string().uuid(),
  sections: z.array(
    z.object({
      name: z.string().min(1),
      price: z.number().min(0),
      currency: z.string().default('usd'),
      numberOfSeats: z.number().min(1),
      seatNumbering: z.object({
        type: z.enum(['numbered', 'alphabet', 'custom']),
        startFrom: z.number().optional(), // For numbered type
        prefix: z.string().optional(), // For alphabet or custom type
        suffix: z.string().optional(),
      }),
    }),
  ),
});

export const updateEventPublishStatusSchema = z.object({
  isPublished: z.boolean(),
});

export const purchaseTicketsSchema = z.object({
  eventId: z.string().uuid(),
  tickets: z.array(
    z.object({
      ticketId: z.string().uuid(),
      seatNumber: z.string(),
    }),
  ),
});

export type TicketGenerationInput = z.infer<typeof ticketGenerationSchema>;
export type UpdateEventPublishStatusInput = z.infer<
  typeof updateEventPublishStatusSchema
>;
export type PurchaseTicketsInput = z.infer<typeof purchaseTicketsSchema>;
