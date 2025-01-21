import { z } from 'zod';

export const createPlatformConfigSchema = z.object({
  key: z.enum(['platform_name', 'platform_fee']),
  value: z.string(),
});

export const updatePlatformConfigSchema = z.object({
  value: z.string(),
});

export type CreatePlatformConfigInput = z.infer<
  typeof createPlatformConfigSchema
>;
export type UpdatePlatformConfigInput = z.infer<
  typeof updatePlatformConfigSchema
>;
