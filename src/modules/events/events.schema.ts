import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const createEventBodySchema = z.object({
  name: z.string({
    required_error: 'Name is required',
  }),
  organizationId: z.string({
    required_error: 'Organization ID is required',
  }),
  capacity: z.number({
    required_error: 'Capacity is required',
  }),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  isVirtual: z.boolean().optional(),
  bannerUrl: z.string().optional(),
  startTimestamp: z.string().optional(),
  endTimestamp: z.string().optional(),
});

const updateEventBodySchema = createEventBodySchema.partial();

export const eventParamsSchema = z.object({
  id: z.string({
    required_error: 'Event ID is required',
  }),
});

export type CreateEventBodySchema = z.infer<typeof createEventBodySchema>;
export type UpdateEventBodySchema = z.infer<typeof updateEventBodySchema>;
export type EventParamsSchema = z.infer<typeof eventParamsSchema>;

export const createEventJSONSchema = {
  body: zodToJsonSchema(createEventBodySchema, 'createEventBodySchema'),
};

export const updateEventJSONSchema = {
  body: zodToJsonSchema(updateEventBodySchema, 'updateEventBodySchema'),
  params: zodToJsonSchema(eventParamsSchema, 'eventParamsSchema'),
};

export const deleteEventJSONSchema = {
  params: zodToJsonSchema(eventParamsSchema, 'eventParamsSchema'),
};

export const updateEventPublishStatusSchema = z.object({
  isPublished: z.boolean(),
});

export type UpdateEventPublishStatusInput = z.infer<
  typeof updateEventPublishStatusSchema
>;
