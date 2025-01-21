import { z } from 'zod';

export const stripeAccountSchema = z.object({
  organizationId: z.string().uuid(),
});

export const stripeAccountStatusSchema = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(['active', 'inactive', 'pending']),
});

export type StripeAccountInput = z.infer<typeof stripeAccountSchema>;
export type StripeAccountStatusInput = z.infer<
  typeof stripeAccountStatusSchema
>;
