import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { organizations } from '../../db/schema';
import { logger } from '../../utils/logger';
import { AppError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { UpdateOrganizationInput } from './organizations.schema';

export async function getOrganizations() {
  try {
    logger.info('Fetching all organizations...');
    const result = await db.select().from(organizations);

    logger.debug(`Successfully fetched ${result.length} organizations`);
    return result;
  } catch (error) {
    logger.error(`Error fetching organizations: ${error}`);
    throw new AppError(500, 'Failed to fetch organizations');
  }
}

export async function getOrganizationById(id: string) {
  try {
    logger.info(`Fetching organization by ID ${id}`);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!organization) {
      logger.warn(`Organization not found with ID ${id}`);
      throw new NotFoundError(`Organization not found with ID ${id}`);
    }

    logger.debug(`Successfully fetched organization ${id}`);
    return organization;
  } catch (error) {
    logger.error(`Error fetching organization: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch organization');
  }
}

export async function checkOrganizationAccess(
  userId: string,
  organizationId: string,
  userRole?: string,
) {
  logger.debug(
    `Checking organization access for user ${userId} and organization ${organizationId}`,
  );

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  // Allow admins to bypass ownership check
  if (userRole === 'admin') {
    return organization;
  }

  // Check if user is the owner
  if (organization.ownerId !== userId) {
    throw new ForbiddenError('Unauthorized to access this organization');
  }

  return organization;
}

export async function updateOrganization(
  userId: string,
  organizationId: string,
  data: UpdateOrganizationInput,
  userRole?: string,
) {
  try {
    logger.info(`Updating organization ${organizationId} by user ${userId}`);
    await checkOrganizationAccess(userId, organizationId, userRole);

    const { eventTypes, socialLinks, ...restData } = data;
    const updateData = {
      ...restData,
      updatedAt: new Date(),
      ...(eventTypes && { eventTypes: JSON.stringify(eventTypes) }),
      ...(socialLinks && { socialLinks: JSON.stringify(socialLinks) }),
    };

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, organizationId))
      .returning();

    logger.info(`Organization ${organizationId} updated successfully`);
    return updatedOrg;
  } catch (error) {
    logger.error(`Error updating organization: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update organization');
  }
}

export async function getCurrentOrganization(userId: string) {
  try {
    logger.info(`Fetching organization for owner ${userId}`);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);

    logger.debug(
      `Successfully fetched organization for owner ${userId}`,
    );
    return organization;
  } catch (error) {
    logger.error(`Error fetching organization by owner: ${error}`);
    throw new AppError(500, 'Failed to fetch organization');
  }
}
