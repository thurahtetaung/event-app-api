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
  startTimestamp: z.string().optional(),
  endTimestamp: z.string().optional(),
});

export type createEventBodySchema = z.infer<typeof createEventBodySchema>;

export const createEventJSONSchema = {
  body: zodToJsonSchema(createEventBodySchema, 'createEventBodySchema'),
};
