import { z } from 'zod';

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const updateOrganizationJSONSchema = {
  body: updateOrganizationSchema,
};
