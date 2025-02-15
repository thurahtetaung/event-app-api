import { z } from 'zod';

const socialLinksSchema = z.object({
  facebook: z.string().url().optional().or(z.literal("")),
  instagram: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').optional(),
  organizationType: z.enum(['company', 'individual', 'non_profit']).optional(),
  description: z.string().min(50, 'Description must be at least 50 characters').optional(),
  website: z.string().url('Must be a valid URL').optional().or(z.literal("")),
  logoUrl: z.string().optional(),
  socialLinks: socialLinksSchema.optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional(),
  eventTypes: z.array(z.string()).min(1, 'Please select at least one event type').optional(),
  address: z.string().min(10, 'Please enter your complete address').optional(),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const updateOrganizationJSONSchema = {
  body: updateOrganizationSchema,
};
