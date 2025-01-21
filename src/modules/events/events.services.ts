import { eq, InferInsertModel } from 'drizzle-orm';
import { db } from '../../db';
import { events, organizations } from '../../db/schema';
import { logger } from '../../utils/logger';
import { tickets } from '../../db/schema';
import { count } from 'drizzle-orm';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors';

// Permission check utility
export async function checkEventOrganizer(
  userId: string,
  eventId: string,
  userRole?: string,
) {
  logger.debug(
    `Checking event organizer permissions for user ${userId} and event ${eventId}`,
  );
  // Allow admins to bypass checks
  if (userRole === 'admin') {
    const event = await db
      .select({
        event: events,
        organization: organizations,
      })
      .from(events)
      .leftJoin(organizations, eq(events.organizationId, organizations.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event.length) {
      logger.warn(`Event not found during permission check: ${eventId}`);
      throw new Error('Event not found');
    }

    logger.debug(
      `Admin permission check passed for user ${userId} and event ${eventId}`,
    );
    return event[0];
  }

  const event = await db
    .select({
      event: events,
      organization: organizations,
    })
    .from(events)
    .leftJoin(organizations, eq(events.organizationId, organizations.id))
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event.length) {
    logger.warn(`Event not found during permission check for event ${eventId}`);
    throw new Error('Event not found');
  }

  if (event[0].organization?.ownerId !== userId) {
    logger.warn(
      `Unauthorized event modification attempt by user ${userId} for event ${eventId}`,
    );
    throw new Error('Unauthorized to modify this event');
  }

  logger.debug(
    `Event organizer permission check passed for user ${userId} and event ${eventId}`,
  );
  return event[0];
}

// For creating events, we need to check if user owns the organization
async function checkOrganizationOwner(
  userId: string,
  organizationId: string,
  userRole?: string,
) {
  logger.info(`Here is the user role: ${userRole}`);
  logger.debug(
    `Checking organization owner permissions for user ${userId} and organization ${organizationId}`,
  );

  // Allow admins to bypass checks
  if (userRole === 'admin') {
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org.length) {
      logger.warn(
        `Organization not found during permission check: ${organizationId}`,
      );
      throw new Error('Organization not found');
    }

    logger.debug(
      `Admin permission check passed for user ${userId} and organization ${organizationId}`,
    );
    return org[0];
  }

  const org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org.length) {
    logger.warn(
      `Organization not found during permission check: ${organizationId}`,
    );
    throw new Error('Organization not found');
  }

  if (org[0].ownerId !== userId) {
    logger.warn(
      `Unauthorized organization access attempt by user ${userId} for organization ${organizationId}`,
    );
    throw new Error('Unauthorized to create events for this organization');
  }

  logger.debug(
    `Organization owner permission check passed for user ${userId} and organization ${organizationId}`,
  );
  return org[0];
}

export async function createEvent(
  userId: string,
  data: InferInsertModel<typeof events>,
  userRole?: string,
) {
  try {
    logger.info(
      `Creating new event for user ${userId} in organization ${data.organizationId}`,
    );
    await checkOrganizationOwner(userId, data.organizationId, userRole);

    const result = await db.insert(events).values(data).returning();
    logger.info(`Event created successfully with ID ${result[0].id}`);
    return result[0];
  } catch (error) {
    logger.error(`Error creating event: ${error}`);
    throw new AppError(500, 'Failed to create event');
  }
}

export async function getEvents() {
  try {
    logger.info('Fetching all events');
    const result = await db
      .select()
      .from(events)
      .where(eq(events.isPublished, true));

    logger.debug(`Successfully fetched ${result.length} events`);
    return result;
  } catch (error) {
    logger.error(`Error fetching events: ${error}`);
    throw new AppError(500, 'Failed to fetch events');
  }
}

export async function getEventById(eventId: string) {
  try {
    logger.info(`Fetching event by ID ${eventId}`);
    const result = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!result[0]) {
      logger.warn(`Event not found with ID ${eventId}`);
      throw new NotFoundError('Event not found');
    }

    logger.debug(`Successfully fetched event ${eventId}`);
    return result[0];
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error(`Error fetching event: ${error}`);
    throw new AppError(500, 'Failed to fetch event');
  }
}

export async function updateEvent(
  userId: string,
  id: string,
  data: Partial<InferInsertModel<typeof events>>,
  userRole?: string,
) {
  try {
    logger.info(`Updating event ${id} by user ${userId}`);
    await checkEventOrganizer(userId, id, userRole);

    // If capacity is being updated, check existing tickets
    if (data.capacity !== undefined) {
      const [ticketCount] = await db
        .select({ count: count() })
        .from(tickets)
        .where(eq(tickets.eventId, id));

      if (ticketCount.count > data.capacity) {
        logger.error(
          `Cannot update event capacity to ${data.capacity} as it would be less than existing ticket count of ${ticketCount.count}`,
        );
        throw new Error(
          `Cannot reduce event capacity below existing ticket count of ${ticketCount.count}`,
        );
      }
    }

    const result = await db
      .update(events)
      .set(data)
      .where(eq(events.id, id))
      .returning();

    logger.info(`Event ${id} updated successfully`);
    return result[0];
  } catch (error) {
    logger.error(`Error updating event: ${error}`);
    throw new AppError(500, 'Failed to update event');
  }
}

export async function deleteEvent(
  userId: string,
  id: string,
  userRole?: string,
) {
  try {
    logger.info(`Deleting event ${id} by user ${userId}`);
    await checkEventOrganizer(userId, id, userRole);

    const result = await db.delete(events).where(eq(events.id, id)).returning();
    logger.info(`Event ${id} deleted successfully`);
    return result[0];
  } catch (error) {
    logger.error(`Error deleting event: ${error}`);
    throw new AppError(500, 'Failed to delete event');
  }
}

export async function updateEventPublishStatus(
  userId: string,
  eventId: string,
  isPublished: boolean,
  userRole?: string,
) {
  try {
    logger.info(
      `Updating event ${eventId} publish status to ${isPublished} by user ${userId}`,
    );
    await checkEventOrganizer(userId, eventId, userRole);

    const [event] = await db
      .update(events)
      .set({
        isPublished,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))
      .returning();

    logger.info(
      `Event ${eventId} publish status updated successfully to ${event.isPublished}`,
    );
    return event;
  } catch (error) {
    logger.error(`Error updating event publish status: ${error}`);
    throw new AppError(500, 'Failed to update event publish status');
  }
}

export async function checkEventExists(eventId: string) {
  const [event] = await db
    .select({
      id: events.id,
      organizationId: events.organizationId,
      isPublished: events.isPublished,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  return event;
}
