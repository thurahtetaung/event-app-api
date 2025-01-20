import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const createOrganizationBodySchema = z.object({
  name: z.string({
    required_error: 'Name is required',
  }),
});

export type createOrganizationBodySchema = z.infer<
  typeof createOrganizationBodySchema
>;

export const createOrganizationJSONSchema = {
  body: zodToJsonSchema(
    createOrganizationBodySchema,
    'createOrganizationBodySchema',
  ),
};
