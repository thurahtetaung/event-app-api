import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const createCategorySchema = z.object({
  name: z.string({
    required_error: 'Name is required',
  }),
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
