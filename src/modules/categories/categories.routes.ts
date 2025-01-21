import { FastifyInstance } from 'fastify';
import {
  createCategoryHandler,
  deleteCategoryHandler,
  getCategoriesHandler,
  getCategoryByIdHandler,
  updateCategoryHandler,
} from './categories.controllers';
import {
  createCategoryJSONSchema,
  updateCategoryJSONSchema,
  categoryParamsJSONSchema,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryParams,
} from './categories.schema';
import { authenticateRequest, checkRole } from '../../middleware/auth';

export async function categoryRoutes(app: FastifyInstance) {
  // Create category (admin only)
  app.post<{ Body: CreateCategoryInput }>(
    '/',
    {
      schema: createCategoryJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    createCategoryHandler,
  );

  // Get all categories (public)
  app.get('/', getCategoriesHandler);

  // Get category by id (public)
  app.get<{ Params: CategoryParams }>(
    '/:id',
    {
      schema: categoryParamsJSONSchema,
    },
    getCategoryByIdHandler,
  );

  // Update category (admin only)
  app.put<{
    Params: CategoryParams;
    Body: UpdateCategoryInput;
  }>(
    '/:id',
    {
      schema: updateCategoryJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    updateCategoryHandler,
  );

  // Delete category (admin only)
  app.delete<{ Params: CategoryParams }>(
    '/:id',
    {
      schema: categoryParamsJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    deleteCategoryHandler,
  );
}
