import { z } from 'zod';

const socialLinksSchema = z.object({
  facebook: z.string().url().optional().or(z.literal("")),
  instagram: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
});

export const createOrganizerApplicationSchema = z.object({
  organizationName: z
    .string({
      required_error: 'Organization name is required',
    })
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must be at most 100 characters'),
  organizationType: z.enum(['company', 'individual', 'non_profit'], {
    required_error: 'Organization type is required',
  }),
  website: z.string().url('Must be a valid URL').optional().or(z.literal("")),
  description: z
    .string({
      required_error: 'Organization description is required',
    })
    .min(50, 'Description must be at least 50 characters')
    .max(1000, 'Description must be at most 1000 characters'),
  experience: z
    .string({
      required_error: 'Experience description is required',
    })
    .min(50, 'Experience must be at least 50 characters')
    .max(1000, 'Experience must be at most 1000 characters'),
  eventTypes: z.array(z.string()).min(1, 'Please select at least one event type'),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  address: z
    .string()
    .min(10, 'Please enter your complete address'),
  socialLinks: socialLinksSchema,
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
