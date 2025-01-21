import { z } from 'zod';

export const createOrganizerApplicationSchema = z.object({
  organizationName: z
    .string({
      required_error: 'Organization name is required',
    })
    .min(1, 'Organization name must not be empty'),
  description: z
    .string({
      required_error: 'Organization description is required',
    })
    .min(1, 'Organization description must not be empty'),
  website: z.string().url('Must be a valid URL').optional(),
  logoUrl: z.string().url('Must be a valid URL').optional(),
  country: z.enum(['US', 'TH']),
});

export const updateOrganizerApplicationStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
});

export type CreateOrganizerApplicationInput = z.infer<
  typeof createOrganizerApplicationSchema
>;
export type UpdateOrganizerApplicationStatusInput = z.infer<
  typeof updateOrganizerApplicationStatusSchema
>;
