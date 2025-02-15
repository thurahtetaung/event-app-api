import { z } from 'zod';

const EVENT_TYPES = [
  'conference',
  'workshop',
  'concert',
  'exhibition',
  'sports',
  'networking',
  'festival',
  'corporate',
] as const;

export const createOrganizerApplicationSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
  organizationType: z.enum(['company', 'individual', 'non_profit']),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  description: z.string().min(50, 'Please provide a detailed description'),
  experience: z.string().min(30, 'Please describe your experience'),
  eventTypes: z.array(z.enum(EVENT_TYPES)).min(1, 'Please select at least one event type'),
  phoneNumber: z.string().min(10, 'Please enter a valid phone number'),
  address: z.string().min(10, 'Please enter your complete address'),
  socialLinks: z.object({
    facebook: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
    instagram: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
    twitter: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
    linkedin: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  }),
});

export type CreateOrganizerApplicationDto = z.infer<typeof createOrganizerApplicationSchema>;