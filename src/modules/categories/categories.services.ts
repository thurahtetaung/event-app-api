import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { categories } from '../../db/schema';
import { CreateCategoryInput, UpdateCategoryInput } from './categories.schema';
import { logger } from '../../utils/logger';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors';

export async function createCategory(input: CreateCategoryInput) {
  try {
    logger.info('Creating new category');
    logger.debug(`Category data: ${JSON.stringify(input)}`);

    const [category] = await db.insert(categories).values(input).returning();

    logger.info(`Successfully created category with ID ${category.id}`);
    return category;
  } catch (error) {
    logger.error(`Error creating category: ${error}`);
    if (error.code === '23505') {
      // Unique violation
      throw new ValidationError('Category with this name already exists');
    }
    throw new AppError(500, 'Failed to create category');
  }
}

export async function getCategories() {
  try {
    logger.info('Fetching all categories');

    const result = await db.select().from(categories);

    logger.info(`Successfully fetched ${result.length} categories`);
    return result;
  } catch (error) {
    logger.error(`Error fetching categories: ${error}`);
    throw new AppError(500, 'Failed to fetch categories');
  }
}

export async function getCategoryById(id: string) {
  try {
    logger.info(`Fetching category with ID ${id}`);

    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    if (!category) {
      logger.warn(`No category found with ID ${id}`);
      throw new NotFoundError(`Category not found with ID ${id}`);
    }

    logger.info(`Successfully fetched category with ID ${id}`);
    return category;
  } catch (error) {
    logger.error(`Error fetching category: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch category');
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  try {
    logger.info(`Updating category with ID ${id}`);
    logger.debug(`Update data: ${JSON.stringify(input)}`);

    const [category] = await db
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();

    if (!category) {
      logger.warn(`No category found with ID ${id}`);
      throw new NotFoundError(`Category not found with ID ${id}`);
    }

    logger.info(`Successfully updated category with ID ${id}`);
    return category;
  } catch (error) {
    logger.error(`Error updating category: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    if (error.code === '23505') {
      // Unique violation
      throw new ValidationError('Category with this name already exists');
    }
    throw new AppError(500, 'Failed to update category');
  }
}

export async function deleteCategory(id: string) {
  try {
    logger.info(`Deleting category with ID ${id}`);

    const [category] = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning();

    if (!category) {
      logger.warn(`No category found with ID ${id}`);
      throw new NotFoundError(`Category not found with ID ${id}`);
    }

    logger.info(`Successfully deleted category with ID ${id}`);
    return category;
  } catch (error) {
    logger.error(`Error deleting category: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    if (error.code === '23503') {
      // Foreign key violation
      throw new ValidationError('Cannot delete category that is in use');
    }
    throw new AppError(500, 'Failed to delete category');
  }
}
