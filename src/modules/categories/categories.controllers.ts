import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryParams,
} from './categories.schema';
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from './categories.services';
import { logger } from '../../utils/logger';
import { handleError } from '../../utils/errors';

export async function createCategoryHandler(
  request: FastifyRequest<{
    Body: CreateCategoryInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const category = await createCategory(request.body);
    return reply.code(201).send(category);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getCategoriesHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const categories = await getCategories();
    return reply.code(200).send(categories);
  } catch (error) {
    return handleError(error, _request, reply);
  }
}

export async function getCategoryByIdHandler(
  request: FastifyRequest<{
    Params: CategoryParams;
  }>,
  reply: FastifyReply,
) {
  try {
    const category = await getCategoryById(request.params.id);

    if (!category) {
      return reply.code(404).send({ message: 'Category not found' });
    }

    return reply.code(200).send(category);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateCategoryHandler(
  request: FastifyRequest<{
    Params: CategoryParams;
    Body: UpdateCategoryInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const category = await updateCategory(request.params.id, request.body);

    if (!category) {
      return reply.code(404).send({ message: 'Category not found' });
    }

    return reply.code(200).send(category);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function deleteCategoryHandler(
  request: FastifyRequest<{
    Params: CategoryParams;
  }>,
  reply: FastifyReply,
) {
  try {
    const category = await deleteCategory(request.params.id);

    if (!category) {
      return reply.code(404).send({ message: 'Category not found' });
    }

    return reply.code(200).send(category);
  } catch (error) {
    return handleError(error, request, reply);
  }
}
