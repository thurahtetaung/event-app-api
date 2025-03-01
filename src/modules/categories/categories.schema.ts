import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Define valid icon names
const VALID_ICONS = [
  'Video', // Conference
  'Presentation', // Workshop
  'Music2', // Concert
  'Palette', // Exhibition
  'Trophy', // Sports
  'Users', // Networking
  'PartyPopper', // Festival
  'Globe', // Other/Default
  'Film', // Movie
  'Utensils', // Food
] as const;

export const createCategorySchema = z.object({
  name: z.string({
    required_error: 'Name is required',
  }),
  icon: z.enum(VALID_ICONS).default('Globe').optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryParamsSchema = z.object({
  id: z.string({
    required_error: 'Category ID is required',
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryParams = z.infer<typeof categoryParamsSchema>;

export const createCategoryJSONSchema = {
  body: zodToJsonSchema(createCategorySchema, 'createCategorySchema'),
};

export const updateCategoryJSONSchema = {
  body: zodToJsonSchema(updateCategorySchema, 'updateCategorySchema'),
  params: zodToJsonSchema(categoryParamsSchema, 'categoryParamsSchema'),
};

export const categoryParamsJSONSchema = {
  params: zodToJsonSchema(categoryParamsSchema, 'categoryParamsSchema'),
};
