import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  platformConfigurations,
  platformConfigurationsEnum,
} from '../../db/schema';
import { logger } from '../../utils/logger';
import {
  CreatePlatformConfigInput,
  UpdatePlatformConfigInput,
} from './platform-configurations.schema';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors';

export async function createPlatformConfig(input: CreatePlatformConfigInput) {
  try {
    logger.info(`Creating platform configuration for key: ${input.key}`);
    const [config] = await db
      .insert(platformConfigurations)
      .values({
        key: input.key as (typeof platformConfigurationsEnum.enumValues)[number],
        value: input.value,
      })
      .returning();
    return config;
  } catch (error) {
    logger.error(`Error creating platform configuration: ${error}`);
    if (error.code === '23505') {
      // Unique violation
      throw new ValidationError(
        `Configuration already exists for key: ${input.key}`,
      );
    }
    throw new AppError(500, 'Failed to create platform configuration');
  }
}

export async function updatePlatformConfig(
  key: (typeof platformConfigurationsEnum.enumValues)[number],
  input: UpdatePlatformConfigInput,
) {
  try {
    logger.info(`Updating platform configuration for key: ${key}`);
    const [config] = await db
      .update(platformConfigurations)
      .set({
        value: input.value,
        updatedAt: new Date(),
      })
      .where(eq(platformConfigurations.key, key))
      .returning();

    if (!config) {
      throw new NotFoundError(`Configuration not found for key: ${key}`);
    }

    return config;
  } catch (error) {
    logger.error(`Error updating platform configuration: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update platform configuration');
  }
}

export async function getPlatformConfigs() {
  try {
    logger.info('Fetching all platform configurations');
    const configs = await db.select().from(platformConfigurations);
    return configs;
  } catch (error) {
    logger.error(`Error fetching platform configurations: ${error}`);
    throw new AppError(500, 'Failed to fetch platform configurations');
  }
}

export async function getPlatformConfigByKey(
  key: (typeof platformConfigurationsEnum.enumValues)[number],
) {
  try {
    logger.info(`Fetching platform configuration for key: ${key}`);
    const [config] = await db
      .select()
      .from(platformConfigurations)
      .where(eq(platformConfigurations.key, key))
      .limit(1);

    if (!config) {
      throw new NotFoundError(`Configuration not found for key: ${key}`);
    }

    return config;
  } catch (error) {
    logger.error(`Error fetching platform configuration: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch platform configuration');
  }
}

export async function deletePlatformConfig(
  key: (typeof platformConfigurationsEnum.enumValues)[number],
) {
  try {
    logger.info(`Deleting platform configuration for key: ${key}`);
    const [config] = await db
      .delete(platformConfigurations)
      .where(eq(platformConfigurations.key, key))
      .returning();

    if (!config) {
      throw new NotFoundError(`Configuration not found for key: ${key}`);
    }

    return config;
  } catch (error) {
    logger.error(`Error deleting platform configuration: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to delete platform configuration');
  }
}

export async function checkPlatformConfigExists(
  key: (typeof platformConfigurationsEnum.enumValues)[number],
) {
  const [config] = await db
    .select({
      key: platformConfigurations.key,
      value: platformConfigurations.value,
    })
    .from(platformConfigurations)
    .where(eq(platformConfigurations.key, key))
    .limit(1);

  if (!config) {
    throw new NotFoundError(`Configuration not found for key: ${key}`);
  }

  return config;
}
